const fs = require("fs");
const path = require("path");
const {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const db = require("../../database");
const { COLORS, BADGES, CHALLENGE_TEMPLATES } = require("../config/constants");
const {
  makeEmbed,
  localDate,
  previousDate,
  weekStart,
  ensureUser,
  getTimezone,
  resetWeeklyPoints,
  getLevel,
  nextLevel,
  progressBar
} = require("../utils/embeds");
const { renderWellnessDashboard } = require("../../dashboardRenderer");

function addWellnessPoints(userId, amount) {
  ensureUser(userId);
  const period = weekStart(localDate(getTimezone(userId)));
  resetWeeklyPoints(userId, period);

  db.prepare(`
    UPDATE users
    SET weekly_points = weekly_points + ?,
        lifetime_points = lifetime_points + ?,
        wellness_points = wellness_points + ?
    WHERE user_id = ?
  `).run(amount, amount, amount, userId);
}

function awardBadges(userId) {
  const streak = db.prepare(`
    SELECT current_streak
    FROM wellness_streaks
    WHERE user_id = ?
  `).get(userId)?.current_streak || 0;

  const checkins = db.prepare(`
    SELECT COUNT(*) AS n
    FROM wellness_checkins
    WHERE user_id = ?
      AND reward_earned = 1
  `).get(userId).n;

  const earned = new Set(
    db.prepare(`
      SELECT badge_id
      FROM user_badges
      WHERE user_id = ?
    `).all(userId).map(row => row.badge_id)
  );

  const counts = {};
  for (const type of ["water", "steps", "sleep"]) {
    counts[type] = db.prepare(`
      SELECT COUNT(DISTINCT activity_date) AS n
      FROM wellness_logs
      WHERE user_id = ?
        AND activity_type = ?
    `).get(userId, type).n;
  }

  const conditions = {
    first_checkin: checkins >= 1,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    water_10: counts.water >= 10,
    steps_10: counts.steps >= 10,
    sleep_10: counts.sleep >= 10,
    selfcare_10: db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_logs WHERE user_id = ? AND activity_type = 'selfcare'
    `).get(userId).n >= 10,
    workout_10: db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_logs WHERE user_id = ? AND activity_type = 'workout'
    `).get(userId).n >= 10,
    challenge_1: db.prepare(`
      SELECT COUNT(*) AS n FROM user_challenge_completions WHERE user_id = ?
    `).get(userId).n >= 1,
    checkin_30: checkins >= 30
  };

  const fresh = [];
  for (const [id, name, description] of BADGES) {
    if (conditions[id] && !earned.has(id)) {
      db.prepare(`
        INSERT OR IGNORE INTO user_badges (user_id, badge_id)
        VALUES (?, ?)
      `).run(userId, id);
      fresh.push({ id, name, description });
    }
  }
  return fresh;
}

function ensureWeeklyChallenges(period) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_challenges (
      week_start,
      challenge_id,
      title,
      description,
      activity_type,
      target,
      reward_points
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const challenge of CHALLENGE_TEMPLATES) {
    insert.run(
      period,
      challenge.id,
      challenge.title,
      challenge.description,
      challenge.type,
      challenge.target,
      challenge.reward
    );
  }

  db.prepare(`
    UPDATE weekly_challenges
    SET target = 42.3,
        description = 'Drink 42.3 cups of water this week.'
    WHERE week_start = ?
      AND challenge_id = 'water_week'
  `).run(period);
}

function challengeProgress(userId, challenge, start) {
  if (challenge.activity_type === "checkin") {
    return db.prepare(`
      SELECT COUNT(*) AS n
      FROM wellness_checkins
      WHERE user_id = ?
        AND checkin_date >= ?
        AND reward_earned = 1
    `).get(userId, start).n;
  }

  if (["selfcare", "workout"].includes(challenge.activity_type)) {
    return db.prepare(`
      SELECT COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ?
        AND activity_type = ?
        AND activity_date >= ?
    `).get(userId, challenge.activity_type, start).n;
  }

  return db.prepare(`
    SELECT COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS n
    FROM wellness_logs
    WHERE user_id = ?
      AND activity_type = ?
      AND activity_date >= ?
  `).get(userId, challenge.activity_type, start).n;
}

function evaluateChallenges(userId) {
  const start = weekStart(localDate(getTimezone(userId)));
  ensureWeeklyChallenges(start);

  const challenges = db.prepare(`
    SELECT *
    FROM weekly_challenges
    WHERE week_start = ?
  `).all(start);

  const completed = [];
  for (const challenge of challenges) {
    const progress = challengeProgress(userId, challenge, start);
    if (progress >= challenge.target) {
      const result = db.prepare(`
        INSERT OR IGNORE INTO user_challenge_completions (
          user_id,
          week_start,
          challenge_id
        )
        VALUES (?, ?, ?)
      `).run(userId, start, challenge.challenge_id);

      if (result.changes) {
        addWellnessPoints(userId, challenge.reward_points);
        completed.push(challenge.title);
      }
    }
  }
  return completed;
}

function recordActivity(userId, type, value) {
  const date = localDate(getTimezone(userId));
  let pointsAwarded = 0;

  if (type === "water") {
    const earnedToday = db.prepare(`
      SELECT COALESCE(SUM(points_awarded), 0) AS total
      FROM wellness_logs
      WHERE user_id = ?
        AND activity_type = 'water'
        AND activity_date = ?
    `).get(userId, date).total;

    const remainingPoints = Math.max(0, 20 - earnedToday);
    const requestedPoints = Math.floor(Number(value) * 2 * 100) / 100;
    pointsAwarded = Math.min(requestedPoints, remainingPoints);
  } else {
    const already = db.prepare(`
      SELECT 1
      FROM wellness_logs
      WHERE user_id = ?
        AND activity_type = ?
        AND activity_date = ?
      LIMIT 1
    `).get(userId, type, date);

    pointsAwarded = already ? 0 : 5;
  }

  db.prepare(`
    INSERT INTO wellness_logs (
      user_id,
      activity_type,
      activity_value,
      activity_date,
      points_awarded
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, String(value), date, pointsAwarded);

  if (pointsAwarded > 0) {
    addWellnessPoints(userId, pointsAwarded);
  }

  return pointsAwarded;
}

function getStats(userId) {
  ensureUser(userId);
  const row = db.prepare(`SELECT * FROM users WHERE user_id = ?`).get(userId);
  const streak = db.prepare(`
    SELECT current_streak, longest_streak
    FROM wellness_streaks
    WHERE user_id = ?
  `).get(userId) || { current_streak: 0, longest_streak: 0 };

  return { ...row, ...streak };
}

function dashboardButtons(targetUserId, activeTab = "overview") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`hootie:overview:${targetUserId}`)
      .setLabel("Overview")
      .setStyle(activeTab === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hootie:activities:${targetUserId}`)
      .setLabel("Activities")
      .setStyle(activeTab === "activities" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hootie:badges:${targetUserId}`)
      .setLabel("Badges")
      .setStyle(activeTab === "badges" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hootie:challenges:${targetUserId}`)
      .setLabel("Challenges")
      .setStyle(activeTab === "challenges" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
}

async function dashboardPayload(user, stats, tab = "overview") {
  const points = stats.lifetime_points || 0;
  const rank = getLevel(points);
  const next = nextLevel(points);

  const activities = db.prepare(`
    SELECT activity_type, COUNT(*) AS n
    FROM wellness_logs
    WHERE user_id = ?
    GROUP BY activity_type
  `).all(user.id);

  const badgeRows = db.prepare(`
    SELECT badge_id
    FROM user_badges
    WHERE user_id = ?
    ORDER BY earned_at DESC
  `).all(user.id);

  const badges = badgeRows.map(row =>
    BADGES.find(badge => badge[0] === row.badge_id)?.[1] || row.badge_id
  );

  const start = weekStart(localDate(getTimezone(user.id)));
  ensureWeeklyChallenges(start);
  const challengeRows = db.prepare(`
    SELECT *
    FROM weekly_challenges
    WHERE week_start = ?
  `).all(start);

  const challenges = challengeRows.map(ch => ({
    ...ch,
    progress: challengeProgress(user.id, ch, start)
  }));

  const { attachment } = await renderWellnessDashboard({
    user,
    stats,
    rank,
    next,
    tab,
    activities,
    badges,
    challenges
  });

  return {
    embeds: [],
    components: [dashboardButtons(user.id, tab)],
    files: [attachment]
  };
}

async function handleWellnessCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;

  if (subcommand === "dashboard") {
    const member = interaction.options.getUser("member") || interaction.user;
    const stats = getStats(member.id);
    const payload = await dashboardPayload(member, stats);
    await interaction.reply({
      ...payload,
      ephemeral: true
    });
    return;
  }

  if (subcommand === "checkin") {
    const response = interaction.options.getString("response", true);
    const visibility = interaction.options.getString("visibility") || "public";
    const isPrivate = visibility === "private";

    const timezone = getTimezone(userId);
    const today = localDate(timezone);

    const prior = db.prepare(`
      SELECT *
      FROM wellness_checkins
      WHERE user_id = ?
        AND checkin_date = ?
        AND reward_earned = 1
    `).get(userId, today);

    const streakRow = db.prepare(`
      SELECT *
      FROM wellness_streaks
      WHERE user_id = ?
    `).get(userId) || {
      current_streak: 0,
      longest_streak: 0,
      last_checkin_date: null
    };

    let streak = streakRow.current_streak || 0;

    if (!prior) {
      streak = streakRow.last_checkin_date === previousDate(today) ? streak + 1 : 1;

      db.prepare(`
        INSERT INTO wellness_checkins (
          user_id, response, visibility, checkin_date, timezone_used, reward_earned
        )
        VALUES (?, ?, ?, ?, ?, 1)
      `).run(userId, response, visibility, today, timezone);

      db.prepare(`
        INSERT INTO wellness_streaks (
          user_id, current_streak, longest_streak, last_checkin_date
        )
        VALUES (?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          current_streak = excluded.current_streak,
          longest_streak = MAX(wellness_streaks.longest_streak, excluded.longest_streak),
          last_checkin_date = excluded.last_checkin_date
      `).run(userId, streak, Math.max(streak, streakRow.longest_streak || 0), today);

      addWellnessPoints(userId, 10);
    } else {
      db.prepare(`
        INSERT INTO wellness_checkins (
          user_id, response, visibility, checkin_date, timezone_used, reward_earned
        )
        VALUES (?, ?, ?, ?, ?, 0)
      `).run(userId, response, visibility, today, timezone);
    }

    const badges = awardBadges(userId);
    const challenges = evaluateChallenges(userId);

    const message = prior
      ? "Your check-in has been added. Today's daily reward was already collected."
      : "Your check-in has been recorded.";

    const e = makeEmbed(
      "🪺 NEST CHECK-IN",
      `${message}\n\n` +
      `**Reflection:** ${response}\n\n` +
      `${prior ? "" : "+10 Wellness Points"} · 🔥 ${streak} day streak`,
      COLORS.burgundy
    );

    await interaction.reply({
      embeds: [e],
      ephemeral: isPrivate
    });

    if (badges.length || challenges.length) {
      const extra = [
        ...badges.map(badge => `🏅 **New badge:** ${badge.name}`),
        ...challenges.map(name => `🏆 **Challenge completed:** ${name}`)
      ].join("\n");

      await interaction.followUp({ content: extra, ephemeral: isPrivate });
    }
    return;
  }

  const activityOptions = {
    water: "cups",
    steps: "count",
    sleep: "hours",
    selfcare: "activity",
    workout: "activity"
  };

  if (activityOptions[subcommand]) {
    const activityValue = interaction.options.get(activityOptions[subcommand]).value;
    const visibility = interaction.options.getString("visibility") || "public";
    const isPrivate = visibility === "private";
    const pointsAwarded = recordActivity(userId, subcommand, activityValue);

    const minutes = subcommand === "workout" ? interaction.options.getInteger("minutes") : null;
    if (minutes) {
      db.prepare(`
        INSERT INTO wellness_logs (
          user_id, activity_type, activity_value, activity_date, points_awarded
        )
        VALUES (?, 'workout_minutes', ?, ?, 0)
      `).run(userId, String(minutes), localDate(getTimezone(userId)));
    }

    const badges = awardBadges(userId);
    const challenges = evaluateChallenges(userId);

    let shown;
    if (subcommand === "water") {
      shown = `${Number(activityValue)} ${Number(activityValue) === 1 ? "cup" : "cups"} of water`;
    } else if (subcommand === "steps") {
      shown = `${Number(activityValue).toLocaleString()} steps`;
    } else if (subcommand === "sleep") {
      shown = `${activityValue} hours of sleep`;
    } else {
      shown = activityValue;
    }

    let message =
      `🦉 <@${userId}> logged **${shown}**!\n` +
      `+${pointsAwarded} Wellness Points`;

    if (subcommand === "water") {
      const earnedToday = db.prepare(`
        SELECT COALESCE(SUM(points_awarded), 0) AS total
        FROM wellness_logs
        WHERE user_id = ? AND activity_type = 'water' AND activity_date = ?
      `).get(userId, localDate(getTimezone(userId))).total;

      message += `\n💧 Daily water points: **${earnedToday}/20**`;
    }

    if (minutes) message += `\n⏱️ Movement duration: **${minutes} minutes**`;
    if (badges.length) message += `\n🏅 New badge: ${badges.map(b => b.name).join(", ")}`;
    if (challenges.length) message += `\n🏆 Challenge completed: ${challenges.join(", ")}`;

    await interaction.reply({
      embeds: [makeEmbed("🌙 WELLNESS LOG UPDATED", message, COLORS.burgundy)],
      ephemeral: isPrivate
    });
    return;
  }

  if (subcommand === "challenges") {
    const start = weekStart(localDate(getTimezone(userId)));
    ensureWeeklyChallenges(start);

    const rows = db.prepare(`
      SELECT *
      FROM weekly_challenges
      WHERE week_start = ?
    `).all(start);

    const lines = rows.map(challenge => {
      const progress = challengeProgress(userId, challenge, start);
      return (
        `${progress >= challenge.target ? "✅" : "🌙"} **${challenge.title}**\n` +
        `${challenge.description}\n` +
        `${progressBar(progress, challenge.target)} ` +
        `${Math.min(progress, challenge.target)}/${challenge.target} · ` +
        `+${challenge.reward_points} points`
      );
    }).join("\n\n");

    await interaction.reply({
      embeds: [makeEmbed(`🏆 ${interaction.user.username.toUpperCase()}'S WEEKLY CHALLENGES`, lines)]
    });
    return;
  }

  if (subcommand === "timezone-set") {
    const zone = interaction.options.getString("zone", true);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone });
    } catch {
      await interaction.reply({
        content: "That time zone isn't valid. Please choose one from the suggestions."
      });
      return;
    }

    db.prepare(`
      INSERT INTO user_timezones (user_id, timezone, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        timezone = excluded.timezone,
        updated_at = CURRENT_TIMESTAMP
    `).run(userId, zone);

    await interaction.reply({
      content: `🕒 <@${userId}>'s Nest time zone is now **${zone}**.`
    });
    return;
  }

  if (subcommand === "timezone-view") {
    await interaction.reply({
      content: `🕒 <@${userId}>'s saved time zone is **${getTimezone(userId)}**.`
    });
  }
}

module.exports = {
  ensureWeeklyChallenges,
  getStats,
  dashboardPayload,
  handleWellnessCommand
};
