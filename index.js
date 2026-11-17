require("dotenv").config();

const db = require("./database");
const commands = require("./commands");
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) throw new Error("DISCORD_TOKEN is missing!");
if (!process.env.CLIENT_ID) throw new Error("CLIENT_ID is missing!");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const COLORS = {
  burgundy: 0x702D46,
  crimson: 0xA34465,
  charcoal: 0x29232B,
  silver: 0xB9AEB6
};

function createEmbed(title, description, color = COLORS.burgundy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: "🦉 Hootie 2.0 • Where the night owls thrive." })
    .setTimestamp();
}

const timezones = [
  ["California", "America/Los_Angeles"],
  ["Oregon", "America/Los_Angeles"],
  ["Oregon - Malheur County", "America/Boise"],
  ["Washington", "America/Los_Angeles"],
  ["Wisconsin", "America/Chicago"],
  ["Texas", "America/Chicago"],
  ["Texas - El Paso", "America/Denver"],
  ["New York", "America/New_York"],
  ["Florida", "America/New_York"],
  ["Florida - Western Panhandle", "America/Chicago"],
  ["Arizona", "America/Phoenix"],
  ["Colorado", "America/Denver"],
  ["Nevada", "America/Los_Angeles"],
  ["Alaska", "America/Anchorage"],
  ["Hawaii", "Pacific/Honolulu"],
  ["Chicago", "America/Chicago"],
  ["Denver", "America/Denver"],
  ["Phoenix", "America/Phoenix"],
  ["Sydney, Australia", "Australia/Sydney"],
  ["Melbourne, Australia", "Australia/Melbourne"],
  ["Brisbane, Australia", "Australia/Brisbane"],
  ["Perth, Australia", "Australia/Perth"],
  ["Adelaide, Australia", "Australia/Adelaide"],
  ["Darwin, Australia", "Australia/Darwin"],
  ["Hobart, Australia", "Australia/Hobart"],
  ["London, UK", "Europe/London"],
  ["Dublin, Ireland", "Europe/Dublin"],
  ["Toronto, Canada", "America/Toronto"],
  ["Vancouver, Canada", "America/Vancouver"],
  ["Mexico City", "America/Mexico_City"],
  ["Tokyo, Japan", "Asia/Tokyo"],
  ["Seoul, South Korea", "Asia/Seoul"],
  ["Auckland, New Zealand", "Pacific/Auckland"]
];

const LEVELS = [
  { name: "🐣 Nestling", points: 0 },
  { name: "🪺 Little Owl", points: 100 },
  { name: "🦉 Cozy Owl", points: 250 },
  { name: "🌿 Wise Owl", points: 500 },
  { name: "🪽 Guardian Owl", points: 1000 },
  { name: "👑 Elder Owl", points: 2000 }
];

const BADGES = [
  { id: "first_checkin", name: "🕯️ First Confession", description: "Completed your first check-in" },
  { id: "streak_7", name: "🔥 Week of Wings", description: "Reached a 7-day check-in streak" },
  { id: "streak_30", name: "🌙 Moonlit Month", description: "Reached a 30-day check-in streak" },
  { id: "water_10", name: "💧 Hydration Familiar", description: "Logged water on 10 different days" },
  { id: "steps_10", name: "👟 Wandering Owl", description: "Logged steps on 10 different days" },
  { id: "sleep_10", name: "🌙 Dream Keeper", description: "Logged sleep on 10 different days" },
  { id: "selfcare_10", name: "🕯️ Ritual of Rest", description: "Logged self-care 10 times" },
  { id: "challenge_1", name: "🏆 Challenge Seeker", description: "Completed your first weekly challenge" }
];

const WEEKLY_CHALLENGE_TEMPLATES = [
  { id: "water_week", title: "The Potion Keeper", description: "Log a total of 10,000 ml of water this week.", type: "water", target: 10000, reward: 25 },
  { id: "steps_week", title: "The Midnight Wanderer", description: "Reach 35,000 steps this week.", type: "steps", target: 35000, reward: 25 },
  { id: "sleep_week", title: "The Dream Guardian", description: "Log 35 hours of sleep this week.", type: "sleep", target: 35, reward: 25 },
  { id: "selfcare_week", title: "The Self-Care Spell", description: "Complete 3 self-care activities this week.", type: "selfcare", target: 3, reward: 25 },
  { id: "checkin_week", title: "A Familiar Face", description: "Complete 5 daily check-ins this week.", type: "checkin", target: 5, reward: 25 }
];

function getLocalDate(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getPreviousDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

function getWeekStart(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay();
  utc.setUTCDate(utc.getUTCDate() - ((day + 6) % 7));
  return utc.toISOString().slice(0, 10);
}

function resetWeeklyPointsIfNeeded() {
  const weekStart = getWeekStart();
  db.prepare(`
    UPDATE users
    SET weekly_points = 0, weekly_period = ?
    WHERE weekly_period IS NULL OR weekly_period != ?
  `).run(weekStart, weekStart);
  return weekStart;
}

function ensureUser(userId) {
  db.prepare(`INSERT OR IGNORE INTO users (user_id) VALUES (?)`).run(userId);
  resetWeeklyPointsIfNeeded();
}

function getTimezone(userId) {
  const row = db.prepare(`SELECT timezone FROM user_timezones WHERE user_id = ?`).get(userId);
  return row ? row.timezone : "America/Los_Angeles";
}

function getLevel(points) {
  let current = LEVELS[0];
  let next = null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].points) current = LEVELS[i];
    else { next = LEVELS[i]; break; }
  }
  return { current, next };
}

function addWellnessPoints(userId, amount) {
  ensureUser(userId);
  db.prepare(`
    UPDATE users
    SET wellness_points = wellness_points + ?,
        weekly_points = weekly_points + ?,
        lifetime_points = lifetime_points + ?
    WHERE user_id = ?
  `).run(amount, amount, amount, userId);
}

function awardBadges(userId) {
  ensureUser(userId);
  const earned = [];
  const insert = db.prepare(`INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)`);
  const checkins = db.prepare(`SELECT COUNT(*) AS total FROM wellness_checkins WHERE user_id = ? AND reward_earned = 1`).get(userId).total;
  const streak = db.prepare(`SELECT current_streak FROM wellness_streaks WHERE user_id = ?`).get(userId);
  const challengeCount = db.prepare(`SELECT COUNT(*) AS total FROM user_challenge_completions WHERE user_id = ?`).get(userId).total;
  const dayCounts = db.prepare(`
    SELECT activity_type, COUNT(DISTINCT activity_date) AS total
    FROM wellness_logs WHERE user_id = ? GROUP BY activity_type
  `).all(userId);
  const counts = Object.fromEntries(dayCounts.map(row => [row.activity_type, row.total]));
  const conditions = [
    ["first_checkin", checkins >= 1],
    ["streak_7", (streak?.current_streak || 0) >= 7],
    ["streak_30", (streak?.current_streak || 0) >= 30],
    ["water_10", (counts.water || 0) >= 10],
    ["steps_10", (counts.steps || 0) >= 10],
    ["sleep_10", (counts.sleep || 0) >= 10],
    ["selfcare_10", (counts.selfcare || 0) >= 10],
    ["challenge_1", challengeCount >= 1]
  ];
  for (const [badgeId, condition] of conditions) {
    if (condition && insert.run(userId, badgeId).changes) {
      earned.push(BADGES.find(badge => badge.id === badgeId));
    }
  }
  return earned.filter(Boolean);
}

function ensureWeeklyChallenges(weekStart) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_challenges
      (week_start, challenge_id, title, description, activity_type, target, reward_points)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const challenge of WEEKLY_CHALLENGE_TEMPLATES) {
    insert.run(weekStart, challenge.id, challenge.title, challenge.description,
      challenge.type, challenge.target, challenge.reward);
  }
}

function getChallengeProgress(userId, challenge, weekStart) {
  const weekEnd = new Date(`${weekStart}T00:00:00.000Z`);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const end = weekEnd.toISOString().slice(0, 10);
  if (challenge.activity_type === "checkin") {
    return db.prepare(`
      SELECT COUNT(DISTINCT checkin_date) AS value FROM wellness_checkins
      WHERE user_id = ? AND reward_earned = 1 AND checkin_date >= ? AND checkin_date < ?
    `).get(userId, weekStart, end).value;
  }
  if (challenge.activity_type === "selfcare") {
    return db.prepare(`
      SELECT COUNT(*) AS value FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'selfcare' AND activity_date >= ? AND activity_date < ?
    `).get(userId, weekStart, end).value;
  }
  const row = db.prepare(`
    SELECT COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS value
    FROM wellness_logs
    WHERE user_id = ? AND activity_type = ? AND activity_date >= ? AND activity_date < ?
  `).get(userId, challenge.activity_type, weekStart, end);
  return row.value;
}

function evaluateChallenges(userId, weekStart) {
  ensureWeeklyChallenges(weekStart);
  const challenges = db.prepare(`SELECT * FROM weekly_challenges WHERE week_start = ?`).all(weekStart);
  const completed = [];
  const insertCompletion = db.prepare(`
    INSERT OR IGNORE INTO user_challenge_completions (user_id, week_start, challenge_id)
    VALUES (?, ?, ?)
  `);
  for (const challenge of challenges) {
    const progress = getChallengeProgress(userId, challenge, weekStart);
    if (progress >= challenge.target) {
      const result = insertCompletion.run(userId, weekStart, challenge.challenge_id);
      if (result.changes) {
        addWellnessPoints(userId, challenge.reward_points);
        completed.push(challenge);
      }
    }
  }
  return completed;
}

function recordActivity(userId, type, value, timezone) {
  ensureUser(userId);
  const today = getLocalDate(timezone);
  const existingReward = db.prepare(`
    SELECT id FROM wellness_logs
    WHERE user_id = ? AND activity_type = ? AND activity_date = ? AND points_awarded = 1
  `).get(userId, type, today);
  const earnsPoints = !existingReward;
  db.prepare(`
    INSERT INTO wellness_logs (user_id, activity_type, activity_value, activity_date, points_awarded)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, String(value), today, earnsPoints ? 1 : 0);
  if (earnsPoints) addWellnessPoints(userId, 5);
  const weekStart = resetWeeklyPointsIfNeeded();
  const completedChallenges = evaluateChallenges(userId, weekStart);
  const newBadges = awardBadges(userId);
  return { earnsPoints, completedChallenges, newBadges };
}

async function registerCommands() {
  try {
    console.log("🦉 Registering Hootie's slash commands...");
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log("🖤 Hootie's slash commands registered!");
  } catch (error) {
    console.error("Command registration failed:", error);
  }
}

function formatChallengeList(userId, weekStart) {
  ensureWeeklyChallenges(weekStart);
  const challenges = db.prepare(`SELECT * FROM weekly_challenges WHERE week_start = ? ORDER BY challenge_id`).all(weekStart);
  return challenges.map(challenge => {
    const progress = getChallengeProgress(userId, challenge, weekStart);
    const completed = db.prepare(`
      SELECT 1 FROM user_challenge_completions
      WHERE user_id = ? AND week_start = ? AND challenge_id = ?
    `).get(userId, weekStart, challenge.challenge_id);
    const pct = Math.min(100, Math.floor((progress / challenge.target) * 100));
    const displayProgress = challenge.activity_type === "water" ? `${Math.round(progress).toLocaleString()} / ${challenge.target.toLocaleString()} ml`
      : challenge.activity_type === "steps" ? `${Math.round(progress).toLocaleString()} / ${challenge.target.toLocaleString()} steps`
      : challenge.activity_type === "sleep" ? `${progress.toFixed(1)} / ${challenge.target} hours`
      : `${progress} / ${challenge.target}`;
    return `${completed ? "✅" : "🌙"} **${challenge.title}** — ${pct}%\n${challenge.description}\nProgress: ${displayProgress} • Reward: **${challenge.reward_points} points**`;
  }).join("\n\n");
}

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName === "timezone" && interaction.options.getSubcommand() === "set") {
      try {
        const focused = interaction.options.getFocused().toLowerCase();
        const filtered = timezones
          .filter(([name, zone]) => name.toLowerCase().includes(focused) || zone.toLowerCase().includes(focused))
          .slice(0, 25)
          .map(([name, zone]) => ({ name: `${name} — ${zone}`, value: zone }));
        await interaction.respond(filtered);
      } catch (error) {
        console.error("Time zone autocomplete error:", error);
        await interaction.respond([]).catch(console.error);
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  try {
    resetWeeklyPointsIfNeeded();

    if (interaction.commandName === "nest") {
      await interaction.reply({ embeds: [createEmbed(
        "🏚️ WELCOME TO THE HAUNTED NEST",
        `Well, well... look who wandered into the woods. 👻\n\nWelcome to **The Nest**, night owl!\n\n🦇 Find your people.\n🕯️ Take care of yourself.\n🖤 Collect your rewards.\n🌙 Make yourself at home.\n\nDon't worry. The ghosts are friendly. Probably.`
      )] });
      return;
    }

    if (interaction.commandName === "ping") {
      await interaction.reply({ embeds: [createEmbed(
        "👻 IS HOOTIE AWAKE?",
        `**BOO!** 🦉\n\nHootie is wide awake and watching over The Nest.\n\n🖤 Systems: Operational\n🌙 Database: Connected\n🦇 Spooky levels: Maximum\n\nAll is quiet in the haunted woods... for now.`,
        COLORS.crimson
      )] });
      return;
    }

    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response");
      const visibility = interaction.options.getString("visibility");
      const userId = interaction.user.id;
      ensureUser(userId);
      const timezone = getTimezone(userId);
      const today = getLocalDate(timezone);
      const yesterday = getPreviousDate(today);

      const result = db.transaction(() => {
        const existingReward = db.prepare(`
          SELECT id FROM wellness_checkins
          WHERE user_id = ? AND checkin_date = ? AND reward_earned = 1
        `).get(userId, today);
        const earnedReward = !existingReward;
        db.prepare(`
          INSERT INTO wellness_checkins
            (user_id, response, visibility, checkin_date, timezone_used, reward_earned)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(userId, response, visibility, today, timezone, earnedReward ? 1 : 0);

        let streak = db.prepare(`
          SELECT current_streak, longest_streak, last_checkin_date
          FROM wellness_streaks WHERE user_id = ?
        `).get(userId);
        let currentStreak = streak ? streak.current_streak : 0;
        let longestStreak = streak ? streak.longest_streak : 0;

        if (earnedReward) {
          if (!streak || !streak.last_checkin_date) currentStreak = 1;
          else if (streak.last_checkin_date === today) currentStreak = streak.current_streak;
          else if (streak.last_checkin_date === yesterday) currentStreak = streak.current_streak + 1;
          else currentStreak = 1;
          longestStreak = Math.max(currentStreak, longestStreak);
          addWellnessPoints(userId, 10);
          db.prepare(`
            INSERT INTO wellness_streaks (user_id, current_streak, longest_streak, last_checkin_date)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
              current_streak = excluded.current_streak,
              longest_streak = excluded.longest_streak,
              last_checkin_date = excluded.last_checkin_date
          `).run(userId, currentStreak, longestStreak, today);
        }
        const weekStart = resetWeeklyPointsIfNeeded();
        const completedChallenges = evaluateChallenges(userId, weekStart);
        const newBadges = awardBadges(userId);
        return { earnedReward, currentStreak, completedChallenges, newBadges };
      }).immediate();

      let description = `A little birdie told me you stopped by. 🦉\n\n**Your confession:**\n> ${response.replace(/\n/g, "\n> ")}\n\n`;
      if (result.earnedReward) {
        description += `🩸 **+10 Wellness Points!**\n🔥 Streak: **${result.currentStreak} days**\n\nYour daily reward has been tucked safely away in The Nest.`;
      } else {
        description += `🖤 Your check-in has been saved!\nYou've already claimed today's reward.\n🔥 Streak: **${result.currentStreak} days**`;
      }
      if (result.completedChallenges.length) description += `\n\n🏆 Challenge completed: ${result.completedChallenges.map(item => item.title).join(", ")}`;
      if (result.newBadges.length) description += `\n\n🎖️ New badge: ${result.newBadges.map(item => item.name).join(", ")}`;
      await interaction.reply({ embeds: [createEmbed("🕯️ MIDNIGHT CONFESSIONS", description, COLORS.crimson)], ephemeral: visibility === "private" });
      return;
    }

    const activityCommands = {
      water: { type: "water", value: interaction.options.getInteger("amount"), label: "💧 WATER LOGGED", unit: "ml", display: amount => `${amount.toLocaleString()} ml of water` },
      steps: { type: "steps", value: interaction.options.getInteger("count"), label: "👟 STEPS LOGGED", unit: "steps", display: amount => `${amount.toLocaleString()} steps` },
      sleep: { type: "sleep", value: interaction.options.getNumber("hours"), label: "🌙 SLEEP LOGGED", unit: "hours", display: amount => `${amount} hours of sleep` },
      selfcare: { type: "selfcare", value: interaction.options.getString("activity"), label: "🕯️ SELF-CARE LOGGED", display: value => value }
    };

    if (activityCommands[interaction.commandName]) {
      const activity = activityCommands[interaction.commandName];
      const userId = interaction.user.id;
      const result = recordActivity(userId, activity.type, activity.value, getTimezone(userId));
      let description = `Hootie tucked this into your wellness journal.\n\n**${activity.display(activity.value)}**\n\n`;
      description += result.earnsPoints ? "🩸 **+5 Wellness Points!** Your first log of this type today earned a reward." : "🖤 Saved! You've already earned today's points for this activity.";
      if (result.completedChallenges.length) description += `\n\n🏆 **Weekly challenge completed!** ${result.completedChallenges.map(item => `${item.title} (+${item.reward_points})`).join(", ")}`;
      if (result.newBadges.length) description += `\n\n🎖️ **New badge unlocked:** ${result.newBadges.map(item => item.name).join(", ")}`;
      await interaction.reply({ embeds: [createEmbed(activity.label, description, COLORS.crimson)], ephemeral: true });
      return;
    }

    if (interaction.commandName === "wellness") {
      const target = interaction.options.getUser("member") || interaction.user;
      const isSelf = target.id === interaction.user.id;
      ensureUser(target.id);
      const user = db.prepare(`SELECT weekly_points, lifetime_points FROM users WHERE user_id = ?`).get(target.id);
      const streak = db.prepare(`SELECT current_streak, longest_streak FROM wellness_streaks WHERE user_id = ?`).get(target.id) || { current_streak: 0, longest_streak: 0 };
      const { current, next } = getLevel(user.lifetime_points);
      const badges = db.prepare(`SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC LIMIT 8`).all(target.id);
      const badgeText = badges.length
        ? badges.map(row => BADGES.find(badge => badge.id === row.badge_id)?.name || row.badge_id).join("\n")
        : "No badges yet. Your first little relic is waiting!";
      const totalCheckins = db.prepare(`SELECT COUNT(*) AS total FROM wellness_checkins WHERE user_id = ?`).get(target.id).total;
      const totalLogs = db.prepare(`SELECT COUNT(*) AS total FROM wellness_logs WHERE user_id = ?`).get(target.id).total;
      const progressFloor = current.points;
      const progressCeiling = next ? next.points : current.points;
      const progressPercent = next
        ? Math.max(0, Math.min(100, Math.floor(((user.lifetime_points - progressFloor) / (progressCeiling - progressFloor)) * 100)))
        : 100;
      const progressBar = "▰".repeat(Math.round(progressPercent / 10)) + "▱".repeat(10 - Math.round(progressPercent / 10));
      const nextProgress = next
        ? `${progressBar} **${progressPercent}%**\n${user.lifetime_points.toLocaleString()} / ${next.points.toLocaleString()} XP to ${next.name}`
        : "▰▰▰▰▰▰▰▰▰▰ **100%**\nMaximum owl rank reached. The crown is yours!";
      const weekStart = resetWeeklyPointsIfNeeded();
      const weekEndDate = new Date(`${weekStart}T00:00:00.000Z`);
      weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
      const weekEnd = weekEndDate.toISOString().slice(0, 10);
      const weeklyActivity = db.prepare(`
        SELECT activity_type, COUNT(*) AS entries, COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS total
        FROM wellness_logs
        WHERE user_id = ? AND activity_date >= ? AND activity_date < ?
        GROUP BY activity_type
      `).all(target.id, weekStart, weekEnd);
      const weeklyStats = Object.fromEntries(weeklyActivity.map(row => [row.activity_type, row]));
      const waterTotal = Math.round(weeklyStats.water?.total || 0).toLocaleString();
      const stepsTotal = Math.round(weeklyStats.steps?.total || 0).toLocaleString();
      const sleepTotal = (weeklyStats.sleep?.total || 0).toFixed(1);
      const selfcareTotal = weeklyStats.selfcare?.entries || 0;
      const description = `**${isSelf ? "Your" : `${target.username}'s`} Nest Archives**\n\n` +
        `🦉 **Rank:** ${current.name}\n` +
        `✨ **Lifetime XP:** ${user.lifetime_points.toLocaleString()}\n` +
        `📈 **Next rank:** ${nextProgress}\n` +
        `🩸 **Weekly Wellness Points:** ${user.weekly_points.toLocaleString()}\n\n` +
        `🌙 **This week's wellness**\n` +
        `💧 Water: **${waterTotal} ml**\n` +
        `👟 Steps: **${stepsTotal}**\n` +
        `🛏️ Sleep: **${sleepTotal} hours**\n` +
        `🕯️ Self-care: **${selfcareTotal} activities**\n\n` +
        `🔥 **Current streak:** ${streak.current_streak} days\n` +
        `🏅 **Longest streak:** ${streak.longest_streak} days\n` +
        `🪺 **Check-ins saved:** ${totalCheckins}\n` +
        `📔 **Wellness logs:** ${totalLogs}\n\n` +
        `🎖️ **Relics & Badges**\n${badgeText}`;
      await interaction.reply({ embeds: [createEmbed("📖 THE NEST ARCHIVES", description, COLORS.crimson)], ephemeral: isSelf });
      return;
    }

    if (interaction.commandName === "leaderboard") {
      const ranking = interaction.options.getString("ranking");
      const column = ranking === "weekly" ? "weekly_points" : "lifetime_points";
      const title = ranking === "weekly" ? "🏆 THIS WEEK'S NIGHT OWLS" : "👑 THE LIFETIME HALL OF OWLS";
      const rows = db.prepare(`SELECT user_id, ${column} AS points FROM users WHERE ${column} > 0 ORDER BY ${column} DESC LIMIT 10`).all();
      if (!rows.length) {
        await interaction.reply({ embeds: [createEmbed(title, "The leaderboard is quiet... Be the first to earn some Wellness Points! 🖤")], ephemeral: true });
        return;
      }
      const lines = [];
      for (let i = 0; i < rows.length; i++) {
        let label = `<@${rows[i].user_id}>`;
        lines.push(`**${i + 1}.** ${label} — **${rows[i].points.toLocaleString()} ${ranking === "weekly" ? "points" : "XP"}**`);
      }
      await interaction.reply({ embeds: [createEmbed(title, lines.join("\n\n"), COLORS.crimson)] });
      return;
    }

    if (interaction.commandName === "challenges") {
      const userId = interaction.user.id;
      ensureUser(userId);
      const weekStart = resetWeeklyPointsIfNeeded();
      const newlyCompleted = evaluateChallenges(userId, weekStart);
      const description = `The weekly trials reset every Monday (UTC). Complete them to earn bonus Wellness Points!\n\n${formatChallengeList(userId, weekStart)}`;
      const embed = createEmbed("🏆 THE WEEKLY HAUNTED TRIALS", description, COLORS.crimson);
      await interaction.reply({ embeds: [embed], ephemeral: true });
      if (newlyCompleted.length) {
        const badges = awardBadges(userId);
        const note = `You completed: ${newlyCompleted.map(item => item.title).join(", ")}.` + (badges.length ? ` New badge: ${badges.map(item => item.name).join(", ")}` : "");
        await interaction.followUp({ content: `🏆 ${note}`, ephemeral: true });
      }
      return;
    }

    if (interaction.commandName === "timezone") {
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;
      if (subcommand === "set") {
        const timezone = interaction.options.getString("zone");
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: timezone });
        } catch {
          await interaction.reply({ embeds: [createEmbed("🌙 LOST IN THE TIME FOG", "That time zone doesn't look familiar. Please select one from Hootie's suggestions.", COLORS.crimson)], ephemeral: true });
          return;
        }
        db.prepare(`
          INSERT INTO user_timezones (user_id, timezone)
          VALUES (?, ?)
          ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone, updated_at = CURRENT_TIMESTAMP
        `).run(userId, timezone);
        await interaction.reply({ embeds: [createEmbed("🕰️ YOUR MIDNIGHT CLOCK", `Your time zone has been tucked safely into Hootie's archives.\n\n🌙 **Saved time zone:** ${timezone}\n\nYour daily rewards and streaks will follow your local calendar.`, COLORS.crimson)], ephemeral: true });
        return;
      }
      if (subcommand === "view") {
        const timezone = getTimezone(userId);
        await interaction.reply({ embeds: [createEmbed("🌙 YOUR MIDNIGHT CLOCK", `Hootie checked the archives!\n\n🕰️ **Your current time zone:**\n${timezone}${db.prepare("SELECT timezone FROM user_timezones WHERE user_id = ?").get(userId) ? "" : " (default)"}\n\nUse \`/timezone set\` to change it whenever you like.`, COLORS.burgundy)], ephemeral: true });
        return;
      }
    }
  } catch (error) {
    console.error("Command response error:", error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [createEmbed("👻 A LITTLE SPOOKY GLITCH", "Hootie stumbled over a cobweb. Something went wrong while processing your command.\n\nPlease try again in a moment. 🖤", COLORS.crimson)],
        ephemeral: true
      }).catch(console.error);
    }
  }
});

client.once(Events.ClientReady, async readyClient => {
  console.log("🖤 HOOTIE 2.0 IS ONLINE");
  console.log("Logged in as " + readyClient.user.tag);
  console.log("Where the night owls thrive.");
  resetWeeklyPointsIfNeeded();
  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
