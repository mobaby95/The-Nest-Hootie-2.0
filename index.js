require("dotenv").config();

const db = require("./database");
const commands = require("./commands");
const fs = require("fs");
const path = require("path");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
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
  ["California", "America/Los_Angeles"], ["Oregon", "America/Los_Angeles"],
  ["Oregon - Malheur County", "America/Boise"], ["Washington", "America/Los_Angeles"],
  ["Wisconsin", "America/Chicago"], ["Texas", "America/Chicago"],
  ["Texas - El Paso", "America/Denver"], ["New York", "America/New_York"],
  ["Florida", "America/New_York"], ["Florida - Western Panhandle", "America/Chicago"],
  ["Arizona", "America/Phoenix"], ["Colorado", "America/Denver"],
  ["Nevada", "America/Los_Angeles"], ["Alaska", "America/Anchorage"],
  ["Hawaii", "Pacific/Honolulu"], ["Chicago", "America/Chicago"],
  ["Denver", "America/Denver"], ["Phoenix", "America/Phoenix"],
  ["Sydney, Australia", "Australia/Sydney"], ["Melbourne, Australia", "Australia/Melbourne"],
  ["Brisbane, Australia", "Australia/Brisbane"], ["Perth, Australia", "Australia/Perth"],
  ["Adelaide, Australia", "Australia/Adelaide"], ["Darwin, Australia", "Australia/Darwin"],
  ["Hobart, Australia", "Australia/Hobart"], ["London, UK", "Europe/London"],
  ["Dublin, Ireland", "Europe/Dublin"], ["Toronto, Canada", "America/Toronto"],
  ["Vancouver, Canada", "America/Vancouver"], ["Mexico City", "America/Mexico_City"],
  ["Tokyo, Japan", "Asia/Tokyo"], ["Seoul, South Korea", "Asia/Seoul"],
  ["Auckland, New Zealand", "Pacific/Auckland"]
];

const LEVELS = [
  { name: "Midnight Hatchling", points: 0, image: "midnight-hatchling.png", emoji: "🐣" },
  { name: "Moonlit Familiar", points: 100, image: "moonlit-familiar.png", emoji: "🪺" },
  { name: "Velvet Night Owl", points: 250, image: "velvet-night-owl.png", emoji: "🦉" },
  { name: "Crimson Oracle", points: 500, image: "crimson-oracle.png", emoji: "🔮" },
  { name: "Shadow Guardian", points: 1000, image: "shadow-guardian.png", emoji: "🪽" },
  { name: "Elder of the Hollow", points: 2000, image: "elder-of-the-hollow.png", emoji: "👑" }
];

const BADGES = [
  { id: "first_checkin", name: "🕯️ First Confession", description: "Complete your first rewarded check-in" },
  { id: "streak_7", name: "🔥 Week of Wings", description: "Reach a 7-day check-in streak" },
  { id: "streak_30", name: "🌙 Moonlit Month", description: "Reach a 30-day check-in streak" },
  { id: "water_10", name: "💧 Hydration Familiar", description: "Log water on 10 different days" },
  { id: "steps_10", name: "👟 Wandering Owl", description: "Log steps on 10 different days" },
  { id: "sleep_10", name: "🌙 Dream Keeper", description: "Log sleep on 10 different days" },
  { id: "selfcare_10", name: "🕯️ Ritual of Rest", description: "Log self-care 10 times" },
  { id: "workout_10", name: "🏋️ Strength of the Hollow", description: "Log 10 workout sessions" },
  { id: "challenge_1", name: "🏆 Challenge Seeker", description: "Complete your first weekly challenge" },
  { id: "checkin_30", name: "📖 Keeper of Confessions", description: "Complete 30 rewarded check-ins" }
];

const WEEKLY_CHALLENGE_TEMPLATES = [
  { id: "water_week", title: "The Potion Keeper", description: "Log a total of 10,000 ml of water this week.", type: "water", target: 10000, reward: 25 },
  { id: "steps_week", title: "The Midnight Wanderer", description: "Reach 35,000 steps this week.", type: "steps", target: 35000, reward: 25 },
  { id: "sleep_week", title: "The Dream Guardian", description: "Log 35 hours of sleep this week.", type: "sleep", target: 35, reward: 25 },
  { id: "selfcare_week", title: "The Self-Care Spell", description: "Complete 3 self-care activities this week.", type: "selfcare", target: 3, reward: 25 },
  { id: "checkin_week", title: "A Familiar Face", description: "Complete 5 daily check-ins this week.", type: "checkin", target: 5, reward: 25 },
  { id: "workout_week", title: "The Iron Familiar", description: "Log 3 workout sessions this week.", type: "workout", target: 3, reward: 25 }
];

function getLocalDate(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
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
    UPDATE users SET weekly_points = 0, weekly_period = ?
    WHERE weekly_period IS NULL OR weekly_period != ?
  `).run(weekStart, weekStart);
  return weekStart;
}

function ensureUser(userId) {
  db.prepare("INSERT OR IGNORE INTO users (user_id) VALUES (?)").run(userId);
  resetWeeklyPointsIfNeeded();
}

function getTimezone(userId) {
  const row = db.prepare("SELECT timezone FROM user_timezones WHERE user_id = ?").get(userId);
  return row ? row.timezone : "America/Los_Angeles";
}

function getLevel(points) {
  let current = LEVELS[0];
  let next = null;
  for (const level of LEVELS) {
    if (points >= level.points) current = level;
    else { next = level; break; }
  }
  return { current, next };
}

function addWellnessPoints(userId, amount) {
  ensureUser(userId);
  db.prepare(`
    UPDATE users SET wellness_points = wellness_points + ?,
      weekly_points = weekly_points + ?, lifetime_points = lifetime_points + ?
    WHERE user_id = ?
  `).run(amount, amount, amount, userId);
}

function awardBadges(userId) {
  ensureUser(userId);
  const earned = [];
  const insert = db.prepare("INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)");
  const checkins = db.prepare("SELECT COUNT(*) AS total FROM wellness_checkins WHERE user_id = ? AND reward_earned = 1").get(userId).total;
  const streak = db.prepare("SELECT current_streak, longest_streak FROM wellness_streaks WHERE user_id = ?").get(userId);
  const challengeCount = db.prepare("SELECT COUNT(*) AS total FROM user_challenge_completions WHERE user_id = ?").get(userId).total;
  const dayCounts = db.prepare(`
    SELECT activity_type, COUNT(DISTINCT activity_date) AS total
    FROM wellness_logs WHERE user_id = ? GROUP BY activity_type
  `).all(userId);
  const counts = Object.fromEntries(dayCounts.map(row => [row.activity_type, row.total]));
  const conditions = [
    ["first_checkin", checkins >= 1],
    ["streak_7", Math.max(streak?.current_streak || 0, streak?.longest_streak || 0) >= 7],
    ["streak_30", Math.max(streak?.current_streak || 0, streak?.longest_streak || 0) >= 30],
    ["water_10", (counts.water || 0) >= 10],
    ["steps_10", (counts.steps || 0) >= 10],
    ["sleep_10", (counts.sleep || 0) >= 10],
    ["selfcare_10", (counts.selfcare || 0) >= 10],
    ["workout_10", (counts.workout || 0) >= 10],
    ["challenge_1", challengeCount >= 1],
    ["checkin_30", checkins >= 30]
  ];
  for (const [badgeId, condition] of conditions) {
    if (condition && insert.run(userId, badgeId).changes) {
      const badge = BADGES.find(item => item.id === badgeId);
      if (badge) earned.push(badge);
    }
  }
  return earned;
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
  const weekEndDate = new Date(`${weekStart}T00:00:00.000Z`);
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 7);
  const end = weekEndDate.toISOString().slice(0, 10);

  if (challenge.activity_type === "checkin") {
    return db.prepare(`
      SELECT COUNT(DISTINCT checkin_date) AS value FROM wellness_checkins
      WHERE user_id = ? AND reward_earned = 1 AND checkin_date >= ? AND checkin_date < ?
    `).get(userId, weekStart, end).value;
  }

  if (challenge.activity_type === "selfcare" || challenge.activity_type === "workout") {
    return db.prepare(`
      SELECT COUNT(*) AS value FROM wellness_logs
      WHERE user_id = ? AND activity_type = ? AND activity_date >= ? AND activity_date < ?
    `).get(userId, challenge.activity_type, weekStart, end).value;
  }

  return db.prepare(`
    SELECT COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS value
    FROM wellness_logs
    WHERE user_id = ? AND activity_type = ? AND activity_date >= ? AND activity_date < ?
  `).get(userId, challenge.activity_type, weekStart, end).value;
}

function evaluateChallenges(userId, weekStart) {
  ensureWeeklyChallenges(weekStart);
  const challenges = db.prepare("SELECT * FROM weekly_challenges WHERE week_start = ?").all(weekStart);
  const completed = [];
  const insertCompletion = db.prepare(`
    INSERT OR IGNORE INTO user_challenge_completions (user_id, week_start, challenge_id)
    VALUES (?, ?, ?)
  `);

  for (const challenge of challenges) {
    if (getChallengeProgress(userId, challenge, weekStart) >= challenge.target) {
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

function progressBar(value, target, size = 10) {
  const pct = target > 0 ? Math.min(100, Math.floor((value / target) * 100)) : 100;
  const filled = Math.round((pct / 100) * size);
  return `${"▰".repeat(filled)}${"▱".repeat(size - filled)} ${pct}%`;
}

function rankImageFile(rank) {
  const filePath = path.join(__dirname, "assets", "ranks", rank.image);
  return fs.existsSync(filePath) ? filePath : null;
}

function getWeeklyStats(userId, weekStart) {
  const endDate = new Date(`${weekStart}T00:00:00.000Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const end = endDate.toISOString().slice(0, 10);
  const rows = db.prepare(`
    SELECT activity_type, COUNT(*) AS entries,
      COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS total
    FROM wellness_logs
    WHERE user_id = ? AND activity_date >= ? AND activity_date < ?
    GROUP BY activity_type
  `).all(userId, weekStart, end);
  return Object.fromEntries(rows.map(row => [row.activity_type, row]));
}

function getDashboardEmbed(user, targetUser, section = "overview") {
  const userId = targetUser.id;
  ensureUser(userId);
  const stats = db.prepare("SELECT weekly_points, lifetime_points FROM users WHERE user_id = ?").get(userId);
  const streak = db.prepare("SELECT current_streak, longest_streak FROM wellness_streaks WHERE user_id = ?").get(userId) || { current_streak: 0, longest_streak: 0 };
  const { current, next } = getLevel(stats.lifetime_points);
  const weekStart = resetWeeklyPointsIfNeeded();
  const weekly = getWeeklyStats(userId, weekStart);
  const totalCheckins = db.prepare("SELECT COUNT(*) AS total FROM wellness_checkins WHERE user_id = ? AND reward_earned = 1").get(userId).total;
  const totalLogs = db.prepare("SELECT COUNT(*) AS total FROM wellness_logs WHERE user_id = ?").get(userId).total;
  const badgeRows = db.prepare("SELECT badge_id, earned_at FROM user_badges WHERE user_id = ? ORDER BY earned_at DESC").all(userId);
  const completedChallenges = db.prepare("SELECT COUNT(*) AS total FROM user_challenge_completions WHERE user_id = ?").get(userId).total;
  const titleName = targetUser.username || "Night Owl";
  const isSelf = targetUser.id === user.id;

  let description = "";
  if (section === "overview") {
    const percent = next ? Math.max(0, Math.min(100, Math.floor(((stats.lifetime_points - current.points) / (next.points - current.points)) * 100))) : 100;
    const bar = progressBar(stats.lifetime_points - current.points, next ? next.points - current.points : 1);
    description =
      `**${isSelf ? "Your" : `${titleName}'s`} Nest Archives**\n\n` +
      `${current.emoji} **${current.name}**\n` +
      `✨ Lifetime XP: **${stats.lifetime_points.toLocaleString()}**\n` +
      `${bar}\n` +
      (next ? `${Math.max(0, next.points - stats.lifetime_points).toLocaleString()} XP until **${next.name}**\n\n` : `Maximum owl evolution reached. 👑\n\n`) +
      `🩸 Weekly Wellness Points: **${stats.weekly_points.toLocaleString()}**\n` +
      `🔥 Current streak: **${streak.current_streak} days**\n` +
      `🏅 Longest streak: **${streak.longest_streak} days**\n` +
      `🪺 Rewarded check-ins: **${totalCheckins}**\n` +
      `📔 Wellness logs: **${totalLogs}**\n` +
      `🏆 Challenges completed: **${completedChallenges}**`;
  } else if (section === "activities") {
    const water = Math.round(weekly.water?.total || 0);
    const steps = Math.round(weekly.steps?.total || 0);
    const sleep = (weekly.sleep?.total || 0).toFixed(1);
    const selfcare = weekly.selfcare?.entries || 0;
    const workouts = weekly.workout?.entries || 0;
    description =
      `**This week's activity totals**\n\n` +
      `💧 Water: **${water.toLocaleString()} ml**\n` +
      `👟 Steps: **${steps.toLocaleString()}**\n` +
      `🌙 Sleep: **${sleep} hours**\n` +
      `🕯️ Self-care: **${selfcare} activities**\n` +
      `🏋️ Workouts: **${workouts} sessions**\n\n` +
      `Use \`/water\`, \`/steps\`, \`/sleep\`, \`/selfcare\`, and \`/workout\` to add entries.`;
  } else if (section === "badges") {
    const earnedIds = new Set(badgeRows.map(row => row.badge_id));
    description = BADGES.map(badge =>
      `${earnedIds.has(badge.id) ? "🏅" : "🔒"} **${badge.name}**\n${badge.description}`
    ).join("\n\n");
    description += `\n\n**Unlocked:** ${earnedIds.size} / ${BADGES.length}`;
  } else if (section === "challenges") {
    const week = resetWeeklyPointsIfNeeded();
    ensureWeeklyChallenges(week);
    const challenges = db.prepare("SELECT * FROM weekly_challenges WHERE week_start = ? ORDER BY challenge_id").all(week);
    description = challenges.map(challenge => {
      const value = getChallengeProgress(userId, challenge, week);
      const done = db.prepare(`
        SELECT 1 FROM user_challenge_completions
        WHERE user_id = ? AND week_start = ? AND challenge_id = ?
      `).get(userId, week, challenge.challenge_id);
      const shown = challenge.activity_type === "water" ? `${Math.round(value).toLocaleString()} / ${challenge.target.toLocaleString()} ml`
        : challenge.activity_type === "steps" ? `${Math.round(value).toLocaleString()} / ${challenge.target.toLocaleString()} steps`
        : challenge.activity_type === "sleep" ? `${value.toFixed(1)} / ${challenge.target} hours`
        : `${value} / ${challenge.target}`;
      return `${done ? "✅" : "🌙"} **${challenge.title}**\n${progressBar(value, challenge.target)}\n${shown} • Reward: **${challenge.reward_points} points**`;
    }).join("\n\n");
    description = `Challenges reset every Monday (UTC).\n\n${description}`;
  }

  const embed = createEmbed(
    section === "overview" ? "📖 THE NEST ARCHIVES" :
    section === "activities" ? "🌙 YOUR WELLNESS JOURNAL" :
    section === "badges" ? "🎖️ RELICS & BADGES" : "🏆 THE WEEKLY HAUNTED TRIALS",
    description,
    COLORS.crimson
  );
  embed.setAuthor({ name: `${titleName} • ${current.name}` });
  const image = rankImageFile(current);
  if (image) embed.setThumbnail(`attachment://${current.image}`);
  return { embed, image };
}

function dashboardRows(ownerId, targetId, section) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`wellness:${ownerId}:${targetId}:overview`).setLabel("Overview").setEmoji("🦉").setStyle(section === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wellness:${ownerId}:${targetId}:activities`).setLabel("Activities").setEmoji("🌙").setStyle(section === "activities" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wellness:${ownerId}:${targetId}:badges`).setLabel("Badges").setEmoji("🎖️").setStyle(section === "badges" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`wellness:${ownerId}:${targetId}:challenges`).setLabel("Challenges").setEmoji("🏆").setStyle(section === "challenges" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );
  return [row];
}

function dashboardPayload(user, target, section = "overview") {
  const result = getDashboardEmbed(user, target, section);
  const payload = {
    embeds: [result.embed],
    components: dashboardRows(user.id, target.id, section),
    ephemeral: target.id === user.id
  };
  if (result.image) payload.files = [new AttachmentBuilder(result.image, { name: path.basename(result.image) })];
  return payload;
}

function ensureChallengeCompletions(userId, weekStart) {
  return evaluateChallenges(userId, weekStart);
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
  return db.prepare("SELECT * FROM weekly_challenges WHERE week_start = ? ORDER BY challenge_id").all(weekStart).map(challenge => {
    const progress = getChallengeProgress(userId, challenge, weekStart);
    const completed = db.prepare(`
      SELECT 1 FROM user_challenge_completions
      WHERE user_id = ? AND week_start = ? AND challenge_id = ?
    `).get(userId, weekStart, challenge.challenge_id);
    const pct = Math.min(100, Math.floor((progress / challenge.target) * 100));
    return `${completed ? "✅" : "🌙"} **${challenge.title}** — ${pct}%\n${challenge.description}\nReward: **${challenge.reward_points} Wellness Points**`;
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

  if (interaction.isButton()) {
    const match = /^wellness:(\d+):(\d+):(overview|activities|badges|challenges)$/.exec(interaction.customId);
    if (!match) return;
    const [, ownerId, targetId, section] = match;
    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: "🖤 This dashboard belongs to another night owl. Open your own with `/wellness`.", ephemeral: true });
      return;
    }
    try {
      const target = await client.users.fetch(targetId);
      const result = getDashboardEmbed(interaction.user, target, section);
      const edit = {
        embeds: [result.embed],
        components: dashboardRows(ownerId, targetId, section),
        files: result.image ? [new AttachmentBuilder(result.image, { name: path.basename(result.image) })] : []
      };
      await interaction.update(edit);
    } catch (error) {
      console.error("Dashboard button error:", error);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Hootie lost a page in the archives. Please run `/wellness` again.", ephemeral: true });
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
        "Well, well... look who wandered into the woods. 👻\n\nWelcome to **The Nest**, night owl!\n\n🦇 Find your people.\n🕯️ Take care of yourself.\n🖤 Collect your rewards.\n🌙 Make yourself at home.\n\nDon't worry. The ghosts are friendly. Probably."
      )] });
      return;
    }

    if (interaction.commandName === "ping") {
      await interaction.reply({ embeds: [createEmbed(
        "👻 IS HOOTIE AWAKE?",
        "BOO! 🦉\n\nHootie is wide awake and watching over The Nest.\n\n🖤 Systems: Operational\n🌙 Database: Connected\n🦇 Spooky levels: Maximum",
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

      let description = `A little birdie told me you stopped by. 🦉\n\n**Your check-in:**\n> ${response.replace(/\n/g, "\n> ")}\n\n`;
      if (result.earnedReward) {
        description += `🩸 **+10 Wellness Points!**\n🔥 Streak: **${result.currentStreak} days**\n\nYour daily reward has been tucked safely away in The Nest.`;
      } else {
        description += `🖤 Your check-in has been saved!\nYou've already claimed today's reward.\n🔥 Streak: **${result.currentStreak} days**`;
      }
      if (result.completedChallenges.length) description += `\n\n🏆 Challenge completed: ${result.completedChallenges.map(item => item.title).join(", ")}`;
      if (result.newBadges.length) description += `\n\n🎖️ New badge: ${result.newBadges.map(item => item.name).join(", ")}`;

      await interaction.reply({
        embeds: [createEmbed("🕯️ MIDNIGHT CONFESSIONS", description, COLORS.crimson)],
        ephemeral: visibility === "private"
      });
      return;
    }

    const activityCommands = {
      water: { type: "water", value: interaction.options.getInteger("amount"), label: "💧 WATER LOGGED", display: amount => `${amount.toLocaleString()} ml of water` },
      steps: { type: "steps", value: interaction.options.getInteger("count"), label: "👟 STEPS LOGGED", display: amount => `${amount.toLocaleString()} steps` },
      sleep: { type: "sleep", value: interaction.options.getNumber("hours"), label: "🌙 SLEEP LOGGED", display: amount => `${amount} hours of sleep` },
      selfcare: { type: "selfcare", value: interaction.options.getString("activity"), label: "🕯️ SELF-CARE LOGGED", display: value => value },
      workout: {
        type: "workout",
        value: `${interaction.options.getString("activity")}${interaction.options.getInteger("minutes") ? ` • ${interaction.options.getInteger("minutes")} minutes` : ""}`,
        label: "🏋️ WORKOUT LOGGED",
        display: value => value
      }
    };

    if (activityCommands[interaction.commandName]) {
      const activity = activityCommands[interaction.commandName];
      const result = recordActivity(interaction.user.id, activity.type, activity.value, getTimezone(interaction.user.id));
      let description = `Hootie tucked this into your wellness journal.\n\n**${activity.display(activity.value)}**\n\n`;
      description += result.earnsPoints
        ? "🩸 **+5 Wellness Points!** Your first log of this type today earned a reward."
        : "🖤 Saved! You've already earned today's points for this activity.";
      if (result.completedChallenges.length) description += `\n\n🏆 **Weekly challenge completed:** ${result.completedChallenges.map(item => `${item.title} (+${item.reward_points})`).join(", ")}`;
      if (result.newBadges.length) description += `\n\n🎖️ **New badge unlocked:** ${result.newBadges.map(item => item.name).join(", ")}`;
      await interaction.reply({ embeds: [createEmbed(activity.label, description, COLORS.crimson)], ephemeral: true });
      return;
    }

    if (interaction.commandName === "wellness") {
      const target = interaction.options.getUser("member") || interaction.user;
      ensureUser(target.id);
      if (target.id !== interaction.user.id) {
        const visibility = db.prepare(`
          SELECT visibility FROM wellness_checkins
          WHERE user_id = ? AND visibility = 'public'
          ORDER BY id DESC LIMIT 1
        `).get(target.id);
        // A profile is viewable by other members only if the member has made a public check-in.
        if (!visibility) {
          await interaction.reply({ content: "That member hasn't made their wellness profile public yet.", ephemeral: true });
          return;
        }
      }
      const payload = dashboardPayload(interaction.user, target, "overview");
      await interaction.reply(payload);
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
      const lines = rows.map((row, index) =>
        `**${index + 1}.** <@${row.user_id}> — **${row.points.toLocaleString()} ${ranking === "weekly" ? "points" : "XP"}**`
      );
      await interaction.reply({ embeds: [createEmbed(title, lines.join("\n\n"), COLORS.crimson)] });
      return;
    }

    if (interaction.commandName === "challenges") {
      const userId = interaction.user.id;
      ensureUser(userId);
      const weekStart = resetWeeklyPointsIfNeeded();
      const newlyCompleted = ensureChallengeCompletions(userId, weekStart);
      const description = `The weekly trials reset every Monday (UTC). Complete them to earn bonus Wellness Points!\n\n${formatChallengeList(userId, weekStart)}`;
      await interaction.reply({ embeds: [createEmbed("🏆 THE WEEKLY HAUNTED TRIALS", description, COLORS.crimson)], ephemeral: true });
      if (newlyCompleted.length) {
        const badges = awardBadges(userId);
        const note = `You completed: ${newlyCompleted.map(item => item.title).join(", ")}.` +
          (badges.length ? ` New badge: ${badges.map(item => item.name).join(", ")}` : "");
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
        await interaction.reply({ embeds: [createEmbed("🕰️ YOUR MIDNIGHT CLOCK", `Your time zone has been saved.\n\n🌙 **Saved time zone:** ${timezone}\nYour daily rewards and streaks will follow your local calendar.`, COLORS.crimson)], ephemeral: true });
        return;
      }
      if (subcommand === "view") {
        const timezone = getTimezone(userId);
        const saved = db.prepare("SELECT timezone FROM user_timezones WHERE user_id = ?").get(userId);
        await interaction.reply({ embeds: [createEmbed("🌙 YOUR MIDNIGHT CLOCK", `🕰️ **Your current time zone:**\n${timezone}${saved ? "" : " (default)"}\n\nUse \`/timezone set\` to change it.`, COLORS.burgundy)], ephemeral: true });
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
    } else if (interaction.isRepliable() && interaction.deferred) {
      await interaction.editReply({ content: "Hootie hit a little glitch. Please try again.", embeds: [], components: [] }).catch(console.error);
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
