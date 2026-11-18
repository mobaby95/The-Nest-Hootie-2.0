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
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) {
  throw new Error("Missing DISCORD_TOKEN environment variable.");
}

if (!process.env.CLIENT_ID) {
  throw new Error("Missing CLIENT_ID environment variable.");
}

// ==========================================
// 🖤 HOOTIE 2.0 CONFIGURATION
// ==========================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const rest = new REST({ version: "10" })
  .setToken(process.env.DISCORD_TOKEN);

const COLORS = {
  burgundy: 0x702D46,
  crimson: 0xA34465,
  charcoal: 0x29232B,
  silver: 0xB9AEB6,
  rose: 0xC18A9E
};

const FOOTER = "Hootie 2.0 • Where the night owls thrive 🖤";

const LEVELS = [
  { name: "Midnight Hatchling", emoji: "🐣", points: 0, image: "midnight-hatchling.png" },
  { name: "Moonlit Familiar", emoji: "🌙", points: 100, image: "moonlit-familiar.png" },
  { name: "Velvet Night Owl", emoji: "🦉", points: 250, image: "velvet-night-owl.png" },
  { name: "Crimson Oracle", emoji: "🔮", points: 500, image: "crimson-oracle.png" },
  { name: "Shadow Guardian", emoji: "🖤", points: 1000, image: "shadow-guardian.png" },
  { name: "Elder of the Hollow", emoji: "👑", points: 2000, image: "elder-of-the-hollow.png" }
];

const BADGES = [
  ["first_checkin", "First Confession", "Complete your first check-in."],
  ["streak_7", "Week of Wings", "Reach a seven-day check-in streak."],
  ["streak_30", "Moonlit Month", "Reach a thirty-day check-in streak."],
  ["water_10", "Hydration Familiar", "Log water on ten different days."],
  ["steps_10", "Wandering Owl", "Log steps on ten different days."],
  ["sleep_10", "Dream Keeper", "Log sleep on ten different days."],
  ["selfcare_10", "Ritual of Rest", "Log self-care ten times."],
  ["workout_10", "Strength of the Hollow", "Log ten movement sessions."],
  ["challenge_1", "Challenge Seeker", "Complete a weekly challenge."],
  ["checkin_30", "Keeper of Confessions", "Complete thirty rewarded check-ins."]
];

const CHALLENGE_TEMPLATES = [
  {
    id: "water_week",
    title: "The Moonwell",
    description: "Drink 42.3 cups of water this week.",
    type: "water",
    target: 42.3,
    reward: 25
  },
  {
    id: "steps_week",
    title: "Wander the Hollow",
    description: "Walk 35,000 steps this week.",
    type: "steps",
    target: 35000,
    reward: 25
  },
  {
    id: "sleep_week",
    title: "Dream Beneath the Stars",
    description: "Log 35 hours of sleep this week.",
    type: "sleep",
    target: 35,
    reward: 25
  },
  {
    id: "selfcare_week",
    title: "A Little Ritual",
    description: "Complete 3 self-care activities this week.",
    type: "selfcare",
    target: 3,
    reward: 25
  },
  {
    id: "checkin_week",
    title: "Five Nights, Five Wings",
    description: "Complete 5 daily check-ins this week.",
    type: "checkin",
    target: 5,
    reward: 25
  },
  {
    id: "workout_week",
    title: "Strength of the Hollow",
    description: "Log 3 movement sessions this week.",
    type: "workout",
    target: 3,
    reward: 25
  }
];

const TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC"
];

// ==========================================
// 🐉 CREATURE SPAWN WEIGHTS & CATCH CHANCE
// ==========================================

const UNIVERSAL_CATCH_CHANCE = 0.65;

const RARITY_SPAWN_WEIGHTS = [
  { rarity: "Common", weight: 50 },
  { rarity: "Uncommon", weight: 25 },
  { rarity: "Rare", weight: 15 },
  { rarity: "Ultra Rare", weight: 7 },
  { rarity: "Legendary", weight: 2 },
  { rarity: "Mythic", weight: 1 }
];

const RARITY_ORDER = {
  Mythic: 1,
  Legendary: 2,
  "Ultra Rare": 3,
  Rare: 4,
  Uncommon: 5,
  Common: 6
};

const SPAWN_MIN_MS = 20 * 60 * 1000;
const SPAWN_MAX_MS = 40 * 60 * 1000;
const SPAWN_LIFETIME_MS = 5 * 60 * 1000;

let spawnTimer = null;

// ==========================================
// 📖 COMMUNITY MADLIBS TEMPLATES (15 PROMPTS)
// ==========================================

const MADLIBS_TEMPLATES = [
  {
    id: "midnight_banquet",
    title: "The Midnight Banquet of the Hollow",
    prompts: [
      "an adjective",
      "a nocturnal creature or animal",
      "a plural noun",
      "a type of beverage",
      "a verb ending in -ing",
      "a spooky or cozy place",
      "an adverb (ending in -ly)",
      "a piece of clothing or accessory",
      "a silly sound effect",
      "a food item",
      "another adjective",
      "a plural body part or object",
      "a verb (past tense)",
      "an exclamation",
      "a magical or mysterious object"
    ],
    build(a) {
      return (
        `Under a **${a[0]}** moon in the deepest corner of The Nest, a **${a[1]}** hosted an urgent midnight banquet. ` +
        `Every guest arrived carrying **${a[2]}** and a warm goblet of **${a[3]}**.\n\n` +
        `Before anyone could sit down, Hootie started **${a[4]}** right in the middle of the **${a[5]}**. ` +
        `The crowd gasped **${a[6]}** as the host adjusted their **${a[7]}** and let out a loud “**${a[8]}**!”\n\n` +
        `For the main course, platters of enchanted **${a[9]}** floated across the table, giving off a **${a[10]}** glow. ` +
        `Suddenly, everyone’s **${a[11]}** began to shimmer, and the oldest owl in the room **${a[12]}** onto the chandelier.\n\n` +
        `“**${a[13]}**!” echoed through the rafters as someone accidentally dropped a **${a[14]}** into the punch bowl—officially making it the greatest night in Hollow history.`
      );
    }
  },
  {
    id: "cursed_library",
    title: "Mystery in the Velvet Archives",
    prompts: [
      "an adjective",
      "a profession or role",
      "a plural noun",
      "a smell or scent",
      "a verb (base form)",
      "a number",
      "a strange creature",
      "an adjective",
      "a musical instrument",
      "a verb ending in -ing",
      "a food or snack",
      "a color",
      "a place in a castle or forest",
      "an exclamation",
      "a noun"
    ],
    build(a) {
      return (
        `Late one **${a[0]}** evening, a wandering **${a[1]}** sneaked into the Velvet Archives searching for lost **${a[2]}**. ` +
        `The air smelled strongly of **${a[3]}**, which was the first sign something was about to **${a[4]}**.\n\n` +
        `On shelf number **${a[5]}**, a tiny **${a[6]}** was guarding a **${a[7]}** spellbook while playing a **${a[8]}**. ` +
        `Instead of running away, the intruder began **${a[9]}** and offered a handful of **${a[10]}** as a peace offering.\n\n` +
        `In a flash of **${a[11]}** smoke, the bookshelves slid open to reveal a secret **${a[12]}**. ` +
        `“**${a[13]}**!” cried Hootie from the rafters, swooping down to claim the legendary **${a[14]}** before anyone else could touch it.`
      );
    }
  },
  {
    id: "hollow_expedition",
    title: "The Great Moonwell Expedition",
    prompts: [
      "an adjective",
      "a vehicle or mode of transport",
      "a plural noun",
      "a weather condition",
      "a verb (past tense)",
      "an animal",
      "an adverb (ending in -ly)",
      "a liquid",
      "an adjective",
      "a piece of furniture",
      "a verb ending in -ing",
      "a snack",
      "a body part",
      "an exclamation",
      "a plural noun"
    ],
    build(a) {
      return (
        `Armed with only a **${a[0]}** lantern and a borrowed **${a[1]}**, the night owls set out to find the fabled Moonwell. ` +
        `Their backpacks were stuffed with **${a[2]}** in case the **${a[3]}** got worse.\n\n` +
        `Halfway through the forest, a giant **${a[4]}** right across their path! A passing **${a[5]}** watched **${a[6]}** as the group accidentally spilled **${a[7]}** all over their **${a[8]}** map.\n\n` +
        `At last, they reached a clearing containing a velvet **${a[9]}** and a fountain that was **${a[10]}** non-stop. ` +
        `After sharing some **${a[11]}**, every traveler felt a tingle in their **${a[12]}**.\n\n` +
        `“**${a[13]}**!” shouted the lookout, realizing the true treasure of the Hollow had been **${a[14]}** all along.`
      );
    }
  }
];

// ==========================================
// 📜 CONTINUE THE STORY PROMPTS
// ==========================================

const STORY_PROMPTS = [
  "Beneath a silver eclipse, a mysterious letter arrived at the gates of The Nest with no return address...",
  "At the stroke of midnight, the lanterns in the Hollow all turned crimson at the exact same moment...",
  "Someone left an unhatched obsidian egg on the Velvet Archives desk with a note reading: 'Do not let it get cold...'",
  "Deep inside the Whispering Woods, a hidden door appeared in the trunk of the oldest hollow oak...",
  "Tonight was supposed to be a quiet evening at the Midnight Arcade—until one of the machines started printing prophecies...",
  "A traveler from beyond the mist knocked three times on Hootie's window carrying a locked music box..."
];

// ==========================================
// 🗄️ EXTRA SQLITE TABLES FOR GAMES
// ==========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS arcade_active_games (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    started_by TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS arcade_story_sessions (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    started_by TEXT NOT NULL,
    last_player_id TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );
`);

// ==========================================
// 🌙 GENERAL HELPERS
// ==========================================

function makeEmbed(title, description, color = COLORS.burgundy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "\u200b")
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

function localDate(timeZone = "UTC", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function previousDate(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function weekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay();

  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));

  return date.toISOString().slice(0, 10);
}

function ensureUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO users (
      user_id,
      wellness_points,
      lifetime_points,
      weekly_points
    )
    VALUES (?, 0, 0, 0)
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO user_timezones (user_id)
    VALUES (?)
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO arcade_points (user_id, points)
    VALUES (?, 0)
  `).run(userId);
}

function getTimezone(userId) {
  ensureUser(userId);

  return db.prepare(`
    SELECT timezone
    FROM user_timezones
    WHERE user_id = ?
  `).get(userId)?.timezone || "America/Los_Angeles";
}

function resetWeeklyPoints(userId, period) {
  ensureUser(userId);

  const row = db.prepare(`
    SELECT weekly_period
    FROM users
    WHERE user_id = ?
  `).get(userId);

  if (row.weekly_period !== period) {
    db.prepare(`
      UPDATE users
      SET weekly_points = 0,
          weekly_period = ?
      WHERE user_id = ?
    `).run(period, userId);
  }
}

function getLevel(points) {
  return [...LEVELS].reverse()
    .find(level => points >= level.points) || LEVELS[0];
}

function nextLevel(points) {
  return LEVELS.find(level => level.points > points) || null;
}

function progressBar(current, target, size = 12) {
  if (!target || target <= 0) {
    return "▰".repeat(size);
  }

  const filled = Math.max(
    0,
    Math.min(size, Math.floor((current / target) * size))
  );

  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function creatureImage(creatureId) {
  const filePath = path.join(
    __dirname,
    "assets",
    "creatures",
    `${creatureId}.png`
  );

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return new AttachmentBuilder(filePath, {
    name: `${creatureId}.png`
  });
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatContributors(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return "No contributors recorded.";
  }
  return uniqueIds.map(id => `<@${id}>`).join(", ");
}

function splitTextChunks(text, maxLength = 3800) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let sliceIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (sliceIndex <= 0) {
      sliceIndex = remaining.lastIndexOf("\n", maxLength);
    }
    if (sliceIndex <= 0) {
      sliceIndex = remaining.lastIndexOf(" ", maxLength);
    }
    if (sliceIndex <= 0) {
      sliceIndex = maxLength;
    }

    chunks.push(remaining.slice(0, sliceIndex).trim());
    remaining = remaining.slice(sliceIndex).trim();
  }

  if (remaining.length) {
    chunks.push(remaining);
  }

  return chunks;
}

// ==========================================
// 🎮 CHANNEL GAME LOCKING HELPERS
// ==========================================

function getActiveChannelGame(guildId, channelId) {
  const tracked = db.prepare(`
    SELECT *
    FROM arcade_active_games
    WHERE guild_id = ?
      AND channel_id = ?
  `).get(guildId, channelId);

  if (tracked) {
    return tracked;
  }

  const legacyLastLetter = db.prepare(`
    SELECT *
    FROM arcade_lastletter_state
    WHERE guild_id = ?
      AND channel_id = ?
  `).get(guildId, channelId);

  if (legacyLastLetter) {
    return {
      guild_id: guildId,
      channel_id: channelId,
      game_type: "lastletter",
      started_by: "",
      state_json: "{}"
    };
  }

  const activeStory = db.prepare(`
    SELECT *
    FROM arcade_story_sessions
    WHERE guild_id = ?
      AND channel_id = ?
  `).get(guildId, channelId);

  if (activeStory) {
    return {
      guild_id: guildId,
      channel_id: channelId,
      game_type: "story",
      started_by: activeStory.started_by,
      state_json: "{}"
    };
  }

  return null;
}

function formatGameName(gameType) {
  if (gameType === "madlibs") return "Community Madlibs";
  if (gameType === "story") return "Continue the Story";
  if (gameType === "lastletter") return "Last Letter";
  return "another community game";
}

// ==========================================
// 🪺 WELLNESS POINTS + OWL XP
// ==========================================

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

// ==========================================
// 🦇 ARCADE POINTS
// ==========================================

function addArcadePoints(userId, amount, reason) {
  ensureUser(userId);

  db.prepare(`
    UPDATE arcade_points
    SET points = points + ?
    WHERE user_id = ?
  `).run(amount, userId);

  db.prepare(`
    INSERT INTO arcade_transactions (user_id, points, reason)
    VALUES (?, ?, ?)
  `).run(userId, amount, reason);
}

function logGame(userId, gameName, score) {
  db.prepare(`
    INSERT INTO arcade_game_stats (user_id, game_name, score)
    VALUES (?, ?, ?)
  `).run(userId, gameName, score);
}

function recordArcadeGame(userId, game, points, reason) {
  addArcadePoints(userId, points, reason);
  logGame(userId, game, points);
}

// ==========================================
// 🏅 BADGE SYSTEM
// ==========================================

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
      SELECT COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'selfcare'
    `).get(userId).n >= 10,

    workout_10: db.prepare(`
      SELECT COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'workout'
    `).get(userId).n >= 10,

    challenge_1: db.prepare(`
      SELECT COUNT(*) AS n
      FROM user_challenge_completions
      WHERE user_id = ?
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

// ==========================================
// 🏆 WEEKLY CHALLENGES
// ==========================================

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

// ==========================================
// 📝 WELLNESS ACTIVITY LOGGING
// ==========================================

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

    pointsAwarded = Math.min(
      requestedPoints,
      remainingPoints
    );
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
  `).run(
    userId,
    type,
    String(value),
    date,
    pointsAwarded
  );

  if (pointsAwarded > 0) {
    addWellnessPoints(userId, pointsAwarded);
  }

  return pointsAwarded;
}

// ==========================================
// 🦉 OWL EVOLUTION DASHBOARD
// ==========================================

function rankAttachment(points) {
  const rank = getLevel(points);

  const filePath = path.join(
    __dirname,
    "assets",
    "ranks",
    rank.image
  );

  if (!fs.existsSync(filePath)) {
    return { rank, file: null };
  }

  return {
    rank,
    file: new AttachmentBuilder(filePath, {
      name: rank.image
    })
  };
}

function getStats(userId) {
  ensureUser(userId);

  const row = db.prepare(`
    SELECT *
    FROM users
    WHERE user_id = ?
  `).get(userId);

  const streak = db.prepare(`
    SELECT current_streak, longest_streak
    FROM wellness_streaks
    WHERE user_id = ?
  `).get(userId) || {
    current_streak: 0,
    longest_streak: 0
  };

  return { ...row, ...streak };
}

function dashboardEmbed(user, stats, tab = "overview") {
  const points = stats.lifetime_points || 0;
  const { rank } = rankAttachment(points);
  const next = nextLevel(points);

  let description =
    `${rank.emoji} **${rank.name}**\n` +
    `Lifetime Owl XP: **${points}**\n` +
    `Weekly Wellness Points: **${stats.weekly_points || 0}**\n`;

  if (next) {
    description +=
      `\n${progressBar(points - rank.points, next.points - rank.points)}\n` +
      `**${next.points - points} XP** until ${next.name}`;
  } else {
    description += "\n👑 You have reached the highest rank.";
  }

  const e = makeEmbed(
    `${user.username}'s Nest Archives`,
    description
  );

  if (tab === "overview") {
    e.addFields(
      {
        name: "🔥 Current Streak",
        value: `${stats.current_streak || 0} days`,
        inline: true
      },
      {
        name: "🏆 Longest Streak",
        value: `${stats.longest_streak || 0} days`,
        inline: true
      },
      {
        name: "🪶 Rank",
        value: rank.name,
        inline: true
      }
    );
  }

  if (tab === "activities") {
    const rows = db.prepare(`
      SELECT activity_type, COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ?
      GROUP BY activity_type
    `).all(user.id);

    e.setDescription(
      rows.length
        ? rows.map(row => `**${row.activity_type}** · ${row.n} logs`).join("\n")
        : "No activities logged yet. Your story is just beginning."
    );
  }

  if (tab === "badges") {
    const rows = db.prepare(`
      SELECT badge_id
      FROM user_badges
      WHERE user_id = ?
      ORDER BY earned_at DESC
    `).all(user.id);

    const names = rows.map(row =>
      BADGES.find(badge => badge[0] === row.badge_id)?.[1] || row.badge_id
    );

    e.setDescription(
      names.length
        ? names.map(name => `🏅 ${name}`).join("\n")
        : "No badges yet. Every little step counts."
    );
  }

  if (tab === "challenges") {
    const start = weekStart(localDate(getTimezone(user.id)));

    ensureWeeklyChallenges(start);

    const rows = db.prepare(`
      SELECT *
      FROM weekly_challenges
      WHERE week_start = ?
    `).all(start);

    e.setDescription(rows.map(challenge => {
      const progress = challengeProgress(user.id, challenge, start);

      return (
        `${progress >= challenge.target ? "✅" : "🌙"} **${challenge.title}**\n` +
        `${progressBar(progress, challenge.target)} ` +
        `${Math.min(progress, challenge.target)}/${challenge.target} · ` +
        `+${challenge.reward_points} points`
      );
    }).join("\n\n"));
  }

  return e;
}

function dashboardButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("hootie:overview")
      .setLabel("Overview")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("hootie:activities")
      .setLabel("Activities")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("hootie:badges")
      .setLabel("Badges")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("hootie:challenges")
      .setLabel("Challenges")
      .setStyle(ButtonStyle.Secondary)
  );
}

function dashboardPayload(user, stats, tab = "overview") {
  const { rank, file } = rankAttachment(stats.lifetime_points || 0);
  const e = dashboardEmbed(user, stats, tab);

  if (file) {
    e.setThumbnail(`attachment://${rank.image}`);
  }

  return {
    embeds: [e],
    components: [dashboardButtons()],
    ...(file ? { files: [file] } : {})
  };
}

function publicWellnessEmbed(user, stats) {
  const points = stats.lifetime_points || 0;
  const rank = getLevel(points);

  const badges = db.prepare(`
    SELECT badge_id
    FROM user_badges
    WHERE user_id = ?
    ORDER BY earned_at DESC
  `).all(user.id);

  const badgeNames = badges.map(row =>
    BADGES.find(badge => badge[0] === row.badge_id)?.[1] || row.badge_id
  );

  return makeEmbed(
    `🪺 ${user.username}'s Public Nest Profile`,
    `${rank.emoji} **${rank.name}**\n` +
    `Lifetime Owl XP: **${points}**\n` +
    `Weekly Wellness Points: **${stats.weekly_points || 0}**\n` +
    `🔥 Current streak: **${stats.current_streak || 0} days**\n` +
    `🏆 Longest streak: **${stats.longest_streak || 0} days**\n\n` +
    `**Achievements**\n` +
    (badgeNames.length
      ? badgeNames.map(name => `🏅 ${name}`).join("\n")
      : "This owl's collection of badges is just beginning."),
    COLORS.burgundy
  );
}

// ==========================================
// 🦇 ARCADE MENU
// ==========================================

async function showArcade(interaction) {
  await interaction.reply({
    embeds: [
      makeEmbed(
        "🦇 The Midnight Arcade",
        "**COMMUNITY GAMES (One game per channel at a time)**\n" +
        "`/madlibs` — Start a 15-prompt community Madlibs story in chat (+5 pts/answer).\n" +
        "`!story start` / `!story end` — Moderator-led community story in chat (+3 pts/line).\n" +
        "`/lastletter start` / `/lastletter stop` — Moderator-led word chain in chat (+5 pts/word).\n\n" +
        "**COLLECTIBLES**\n" +
        "`/creatures collection` — View your companions.\n" +
        "`/creatures profile` — Inspect a creature.\n" +
        "`/catch` — Try to catch a wild creature (65% catch chance).\n\n" +
        "`/arcadeleaderboard` — See the arcade high scores.\n\n" +
        "Arcade Points are separate from Wellness Points and Owl XP.",
        COLORS.charcoal
      )
    ],
    ephemeral: false
  });
}

// ==========================================
// 📖 1. COMMUNITY MADLIBS (CHAT-BASED, 15 PROMPTS)
// ==========================================

async function handleMadlibsCommand(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Community Madlibs can only be played inside a Nest server channel.",
      ephemeral: true
    });
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  const startResult = db.transaction(() => {
    const existing = getActiveChannelGame(guildId, channelId);
    if (existing) {
      return { ok: false, existing };
    }

    const template = randomItem(MADLIBS_TEMPLATES);
    const state = {
      templateId: template.id,
      title: template.title,
      prompts: template.prompts,
      answers: [],
      contributors: [],
      lastPlayerId: ""
    };

    db.prepare(`
      INSERT INTO arcade_active_games (
        guild_id,
        channel_id,
        game_type,
        started_by,
        state_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, 'madlibs', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(guildId, channelId, userId, JSON.stringify(state));

    return { ok: true, template, state };
  })();

  if (!startResult.ok) {
    await interaction.reply({
      content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`,
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    embeds: [
      makeEmbed(
        "📖 COMMUNITY MADLIBS HAS BEGUN!",
        `A new tale is being woven in The Nest: **${startResult.template.title}**\n\n` +
        `Answer each prompt directly in chat! Anyone can join in, and you can answer multiple times—just not twice in a row.\n` +
        `✨ **+5 Arcade Points** for each accepted answer!\n\n` +
        `**Prompt 1 of ${startResult.template.prompts.length}:** Give me **${startResult.template.prompts[0]}**!`,
        COLORS.charcoal
      )
    ]
  });
}

async function processMadlibsMessage(message) {
  const rawInput = message.content.trim();
  if (!rawInput || rawInput.startsWith("!") || rawInput.startsWith("/")) {
    return;
  }

  const cleanAnswer = rawInput.replace(/\s+/g, " ").trim();
  if (cleanAnswer.length < 1 || cleanAnswer.length > 60) {
    return;
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const txResult = db.transaction(() => {
    const active = db.prepare(`
      SELECT *
      FROM arcade_active_games
      WHERE guild_id = ?
        AND channel_id = ?
        AND game_type = 'madlibs'
    `).get(guildId, channelId);

    if (!active) {
      return { status: "inactive" };
    }

    let state;
    try {
      state = JSON.parse(active.state_json);
    } catch {
      return { status: "corrupt" };
    }

    const prompts = Array.isArray(state.prompts) ? state.prompts : [];
    const answers = Array.isArray(state.answers) ? state.answers : [];
    const contributors = Array.isArray(state.contributors) ? state.contributors : [];

    if (answers.length >= prompts.length) {
      return { status: "inactive" };
    }

    if (state.lastPlayerId === userId) {
      return { status: "same_player" };
    }

    answers.push(cleanAnswer);
    contributors.push(userId);
    state.answers = answers;
    state.contributors = contributors;
    state.lastPlayerId = userId;

    recordArcadeGame(
      userId,
      "madlibs",
      5,
      `Community Madlibs (${answers.length}/${prompts.length})`
    );

    if (answers.length >= prompts.length) {
      const template =
        MADLIBS_TEMPLATES.find(t => t.id === state.templateId) ||
        MADLIBS_TEMPLATES[0];

      const completedStory = template.build(answers);

      db.prepare(`
        INSERT INTO arcade_madlibs (
          guild_id,
          channel_id,
          user_id,
          story_text
        )
        VALUES (?, ?, ?, ?)
      `).run(guildId, channelId, active.started_by || userId, completedStory);

      db.prepare(`
        DELETE FROM arcade_active_games
        WHERE guild_id = ?
          AND channel_id = ?
          AND game_type = 'madlibs'
      `).run(guildId, channelId);

      return {
        status: "completed",
        title: template.title,
        story: completedStory,
        contributors,
        acceptedAnswer: cleanAnswer
      };
    }

    db.prepare(`
      UPDATE arcade_active_games
      SET state_json = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
        AND game_type = 'madlibs'
    `).run(JSON.stringify(state), guildId, channelId);

    return {
      status: "next_prompt",
      acceptedAnswer: cleanAnswer,
      stepNumber: answers.length + 1,
      totalPrompts: prompts.length,
      nextPrompt: prompts[answers.length]
    };
  })();

  if (txResult.status === "inactive" || txResult.status === "corrupt") {
    return;
  }

  if (txResult.status === "same_player") {
    await message.reply({
      content: "🪶 Give another night owl a turn before submitting the next Madlibs word!"
    });
    return;
  }

  if (txResult.status === "next_prompt") {
    await message.reply({
      embeds: [
        makeEmbed(
          "📖 WORD ACCEPTED!",
          `**${message.author.username}** added **${txResult.acceptedAnswer}**! ✨ **+5 Arcade Points**\n\n` +
          `**Prompt ${txResult.stepNumber} of ${txResult.totalPrompts}:** Give me **${txResult.nextPrompt}**!`,
          COLORS.charcoal
        )
      ]
    });
    return;
  }

  if (txResult.status === "completed") {
    await message.reply({
      embeds: [
        makeEmbed(
          `📚 ${txResult.title.toUpperCase()}`,
          `**${message.author.username}** supplied the final word (**${txResult.acceptedAnswer}**) and earned **+5 Arcade Points**!\n\n` +
          `${txResult.story}\n\n` +
          `**Contributors:** ${formatContributors(txResult.contributors)}`,
          COLORS.crimson
        )
      ]
    });
  }
}

// ==========================================
// 📜 2. CONTINUE THE STORY (!story start / !story end)
// ==========================================

async function handleStoryPrefixCommand(message, action) {
  if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({
      content: "Only members with **Manage Server** permission can start or end Continue the Story."
    });
    return;
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (action === "start") {
    const startResult = db.transaction(() => {
      const existing = getActiveChannelGame(guildId, channelId);
      if (existing) {
        return { ok: false, existing };
      }

      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const prompt = randomItem(STORY_PROMPTS);

      db.prepare(`
        INSERT INTO arcade_active_games (
          guild_id,
          channel_id,
          game_type,
          started_by,
          state_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, 'story', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(guildId, channelId, userId, JSON.stringify({ sessionId }));

      db.prepare(`
        INSERT INTO arcade_story_sessions (
          guild_id,
          channel_id,
          session_id,
          prompt,
          started_by,
          last_player_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          session_id = excluded.session_id,
          prompt = excluded.prompt,
          started_by = excluded.started_by,
          last_player_id = '',
          created_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      `).run(guildId, channelId, sessionId, prompt, userId);

      // Record the session marker in the preserved arcade_story_contributions table
      db.prepare(`
        INSERT INTO arcade_story_contributions (
          guild_id,
          channel_id,
          user_id,
          contribution
        )
        VALUES (?, ?, ?, ?)
      `).run(guildId, channelId, "SYSTEM_START", `[SESSION:${sessionId}] ${prompt}`);

      return { ok: true, prompt };
    })();

    if (!startResult.ok) {
      await message.reply({
        content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`
      });
      return;
    }

    await message.channel.send({
      embeds: [
        makeEmbed(
          "📜 CONTINUE THE STORY HAS BEGUN!",
          `**Story Prompt:**\n*${startResult.prompt}*\n\n` +
          `Type your next part of the story directly in chat (**1–500 characters**).\n` +
          `• You can contribute multiple times, just not twice in a row.\n` +
          `• Each accepted line earns **+3 Arcade Points**.\n` +
          `• Moderators can end the round anytime with \`!story end\`.`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (action === "end") {
    const endResult = db.transaction(() => {
      const session = db.prepare(`
        SELECT *
        FROM arcade_story_sessions
        WHERE guild_id = ?
          AND channel_id = ?
      `).get(guildId, channelId);

      const active = db.prepare(`
        SELECT *
        FROM arcade_active_games
        WHERE guild_id = ?
          AND channel_id = ?
          AND game_type = 'story'
      `).get(guildId, channelId);

      if (!session && !active) {
        return { ok: false };
      }

      let sessionId = session?.session_id || "";
      if (!sessionId && active?.state_json) {
        try {
          sessionId = JSON.parse(active.state_json).sessionId || "";
        } catch {
          sessionId = "";
        }
      }

      const startMarker = sessionId
        ? db.prepare(`
            SELECT id, contribution
            FROM arcade_story_contributions
            WHERE guild_id = ?
              AND channel_id = ?
              AND user_id = 'SYSTEM_START'
              AND contribution LIKE ?
            ORDER BY id DESC
            LIMIT 1
          `).get(guildId, channelId, `[SESSION:${sessionId}]%`)
        : db.prepare(`
            SELECT id, contribution
            FROM arcade_story_contributions
            WHERE guild_id = ?
              AND channel_id = ?
              AND user_id = 'SYSTEM_START'
            ORDER BY id DESC
            LIMIT 1
          `).get(guildId, channelId);

      const minId = startMarker ? startMarker.id : 0;

      const entries = db.prepare(`
        SELECT id, user_id, contribution
        FROM arcade_story_contributions
        WHERE guild_id = ?
          AND channel_id = ?
          AND id > ?
          AND user_id NOT IN ('SYSTEM_START', 'SYSTEM_END')
        ORDER BY id ASC
      `).all(guildId, channelId, minId);

      if (sessionId) {
        db.prepare(`
          INSERT INTO arcade_story_contributions (
            guild_id,
            channel_id,
            user_id,
            contribution
          )
          VALUES (?, ?, 'SYSTEM_END', ?)
        `).run(guildId, channelId, `[SESSION_END:${sessionId}]`);
      }

      db.prepare(`
        DELETE FROM arcade_story_sessions
        WHERE guild_id = ?
          AND channel_id = ?
      `).run(guildId, channelId);

      db.prepare(`
        DELETE FROM arcade_active_games
        WHERE guild_id = ?
          AND channel_id = ?
          AND game_type = 'story'
      `).run(guildId, channelId);

      return {
        ok: true,
        prompt: session?.prompt || "A tale spun in The Nest",
        entries
      };
    })();

    if (!endResult.ok) {
      await message.reply({
        content: "There isn't an active **Continue the Story** game in this channel."
      });
      return;
    }

    if (!endResult.entries.length) {
      await message.channel.send({
        embeds: [
          makeEmbed(
            "📜 CONTINUE THE STORY ENDED",
            `**Prompt:** *${endResult.prompt}*\n\nNo story lines were added this round.`,
            COLORS.charcoal
          )
        ]
      });
      return;
    }

    const fullStory = endResult.entries
      .map(entry => entry.contribution)
      .join(" ");

    const contributors = formatContributors(
      endResult.entries.map(entry => entry.user_id)
    );

    const storyChunks = splitTextChunks(fullStory, 3500);

    for (let i = 0; i < storyChunks.length; i++) {
      const isFirst = i === 0;
      const isLast = i === storyChunks.length - 1;

      let description = "";
      if (isFirst) {
        description += `**Prompt:** *${endResult.prompt}*\n\n`;
      }
      description += storyChunks[i];
      if (isLast) {
        description += `\n\n**Contributors:** ${contributors}`;
      }

      await message.channel.send({
        embeds: [
          makeEmbed(
            isFirst
              ? "📚 THE COMPLETED NEST STORY"
              : `📚 THE COMPLETED NEST STORY (Part ${i + 1})`,
            description,
            COLORS.crimson
          )
        ]
      });
    }
  }
}

async function processStoryMessage(message) {
  const contribution = message.content.trim();
  if (!contribution || contribution.startsWith("!") || contribution.startsWith("/")) {
    return;
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const txResult = db.transaction(() => {
    const session = db.prepare(`
      SELECT *
      FROM arcade_story_sessions
      WHERE guild_id = ?
        AND channel_id = ?
    `).get(guildId, channelId);

    if (!session) {
      return { status: "inactive" };
    }

    if (contribution.length < 1 || contribution.length > 500) {
      return { status: "invalid_length", length: contribution.length };
    }

    if (session.last_player_id === userId) {
      return { status: "same_player" };
    }

    db.prepare(`
      INSERT INTO arcade_story_contributions (
        guild_id,
        channel_id,
        user_id,
        contribution
      )
      VALUES (?, ?, ?, ?)
    `).run(guildId, channelId, userId, contribution);

    db.prepare(`
      UPDATE arcade_story_sessions
      SET last_player_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
    `).run(userId, guildId, channelId);

    db.prepare(`
      UPDATE arcade_active_games
      SET updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
        AND game_type = 'story'
    `).run(guildId, channelId);

    recordArcadeGame(
      userId,
      "story",
      3,
      "Added to Continue the Story"
    );

    return { status: "accepted" };
  })();

  if (txResult.status === "inactive") {
    return;
  }

  if (txResult.status === "invalid_length") {
    await message.reply({
      content: `📜 Your story contribution must be between **1 and 500 characters** (yours was ${txResult.length}).`
    });
    return;
  }

  if (txResult.status === "same_player") {
    await message.reply({
      content: "🪶 Give another night owl a turn before adding the next part of the story!"
    });
    return;
  }

  if (txResult.status === "accepted") {
    await message.reply({
      embeds: [
        makeEmbed(
          "📜 LINE ADDED TO THE STORY!",
          `**${message.author.username}** continued the tale! ✨ **+3 Arcade Points**\n\n` +
          `Keep going in chat, or a moderator can finish and publish the story with \`!story end\`.`,
          COLORS.charcoal
        )
      ]
    });
  }
}

// ==========================================
// 📝 3. LAST LETTER — CHAT-BASED GAME
// ==========================================

function getRandomStartingLetter() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return letters[Math.floor(Math.random() * letters.length)];
}

async function handleLastLetterCommand(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "Last Letter can only be played inside a Nest server channel.",
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Only members with Manage Server permission can start or stop Last Letter.",
      ephemeral: true
    });
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  if (subcommand === "start") {
    const startingLetter = getRandomStartingLetter();

    const startResult = db.transaction(() => {
      const existing = getActiveChannelGame(guildId, channelId);
      if (existing) {
        return { ok: false, existing };
      }

      db.prepare(`
        INSERT INTO arcade_active_games (
          guild_id,
          channel_id,
          game_type,
          started_by,
          state_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, 'lastletter', ?, '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(guildId, channelId, userId);

      db.prepare(`
        INSERT INTO arcade_lastletter_state (
          guild_id,
          channel_id,
          current_letter,
          last_player_id,
          used_words,
          round_count,
          updated_at
        )
        VALUES (?, ?, ?, '', '[]', 0, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          current_letter = excluded.current_letter,
          last_player_id = '',
          used_words = '[]',
          round_count = 0,
          updated_at = CURRENT_TIMESTAMP
      `).run(guildId, channelId, startingLetter);

      return { ok: true, startingLetter };
    })();

    if (!startResult.ok) {
      await interaction.reply({
        content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      embeds: [
        makeEmbed(
          "📝 LAST LETTER IS OPEN!",
          `The Nest word chain has begun!\n\n` +
          `**Starting letter: ${startResult.startingLetter.toUpperCase()}**\n\n` +
          `Type a word (2–30 English letters) directly into this channel that starts with **${startResult.startingLetter.toUpperCase()}**.\n\n` +
          "The next player must use the last letter of the previous word. No repeated words, and no taking two turns in a row!\n\n" +
          "**Each valid word earns +5 Arcade Points.**",
          COLORS.charcoal
        )
      ]
    });

    return;
  }

  if (subcommand === "stop") {
    const stopResult = db.transaction(() => {
      const state = db.prepare(`
        SELECT round_count
        FROM arcade_lastletter_state
        WHERE guild_id = ?
          AND channel_id = ?
      `).get(guildId, channelId);

      const deletedState = db.prepare(`
        DELETE FROM arcade_lastletter_state
        WHERE guild_id = ?
          AND channel_id = ?
      `).run(guildId, channelId);

      const deletedLock = db.prepare(`
        DELETE FROM arcade_active_games
        WHERE guild_id = ?
          AND channel_id = ?
          AND game_type = 'lastletter'
      `).run(guildId, channelId);

      return {
        stopped: deletedState.changes > 0 || deletedLock.changes > 0,
        roundCount: state?.round_count || 0
      };
    })();

    await interaction.reply({
      embeds: [
        makeEmbed(
          "🌙 LAST LETTER HAS ENDED",
          stopResult.stopped
            ? `The word chain has been closed after **${stopResult.roundCount}** valid words. Thanks for playing, night owls!`
            : "There isn't an active Last Letter game in this channel.",
          COLORS.burgundy
        )
      ]
    });

    return;
  }
}

async function processLastLetterMessage(message) {
  const rawWord = message.content.trim();

  if (!/^[a-zA-Z]{2,30}$/.test(rawWord)) {
    return;
  }

  const word = rawWord.toLowerCase();
  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const result = db.transaction(() => {
    const state = db.prepare(`
      SELECT *
      FROM arcade_lastletter_state
      WHERE guild_id = ?
        AND channel_id = ?
    `).get(guildId, channelId);

    if (!state) {
      return { status: "inactive" };
    }

    let usedWords = [];

    try {
      usedWords = JSON.parse(state.used_words || "[]");

      if (!Array.isArray(usedWords)) {
        usedWords = [];
      }
    } catch {
      usedWords = [];
    }

    if (usedWords.includes(word)) {
      return {
        status: "duplicate",
        word
      };
    }

    if (
      state.current_letter &&
      word[0] !== state.current_letter.toLowerCase()
    ) {
      return {
        status: "wrong_letter",
        requiredLetter: state.current_letter
      };
    }

    if (state.last_player_id === userId) {
      return {
        status: "same_player"
      };
    }

    usedWords.push(word);

    const nextLetter = word[word.length - 1];

    db.prepare(`
      UPDATE arcade_lastletter_state
      SET current_letter = ?,
          last_player_id = ?,
          used_words = ?,
          round_count = round_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
    `).run(
      nextLetter,
      userId,
      JSON.stringify(usedWords),
      guildId,
      channelId
    );

    db.prepare(`
      UPDATE arcade_active_games
      SET updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ?
        AND channel_id = ?
        AND game_type = 'lastletter'
    `).run(guildId, channelId);

    recordArcadeGame(
      userId,
      "lastletter",
      5,
      `Last Letter: ${word}`
    );

    return {
      status: "accepted",
      word,
      nextLetter,
      roundCount: usedWords.length
    };
  })();

  if (result.status === "inactive") {
    return;
  }

  if (result.status === "duplicate") {
    await message.reply({
      content: `🌙 **${result.word}** has already been used in this round. Try another word!`
    });
    return;
  }

  if (result.status === "wrong_letter") {
    await message.reply({
      content: `🦉 Not quite! The next word must start with **${result.requiredLetter.toUpperCase()}**.`
    });
    return;
  }

  if (result.status === "same_player") {
    await message.reply({
      content: "🪶 Give another night owl a turn before playing again!"
    });
    return;
  }

  if (result.status === "accepted") {
    await message.reply({
      embeds: [
        makeEmbed(
          "🔤 WORD ACCEPTED!",
          `**${message.author.username}** played **${result.word}**!\n\n` +
          `The next word must start with **${result.nextLetter.toUpperCase()}**.\n\n` +
          `✨ **+5 Arcade Points**\n` +
          `📝 Words played this round: **${result.roundCount}**`,
          COLORS.charcoal
        )
      ]
    });
  }
}

// ==========================================
// 💬 UNIFIED CHAT MESSAGE ROUTER
// ==========================================

client.on(Events.MessageCreate, async message => {
  try {
    if (!message.guild || message.author.bot || message.webhookId) {
      return;
    }

    const content = (message.content || "").trim();
    if (!content) {
      return;
    }

    // Handle !story start and !story end moderator commands
    const lowerContent = content.toLowerCase();
    if (lowerContent === "!story start" || lowerContent === "!story end") {
      const action = lowerContent.endsWith("start") ? "start" : "end";
      await handleStoryPrefixCommand(message, action);
      return;
    }

    const activeGame = getActiveChannelGame(message.guild.id, message.channel.id);
    if (!activeGame) {
      return;
    }

    if (activeGame.game_type === "madlibs") {
      await processMadlibsMessage(message);
      return;
    }

    if (activeGame.game_type === "story") {
      await processStoryMessage(message);
      return;
    }

    if (activeGame.game_type === "lastletter") {
      await processLastLetterMessage(message);
      return;
    }
  } catch (error) {
    console.error("Community game message error:", error);

    await message.reply({
      content: "🖤 Hootie had a little trouble processing that message. Please try again."
    }).catch(() => {});
  }
});

// ==========================================
// 🐉 CREATURE SPAWNING SYSTEM (WEIGHTED RARITY)
// ==========================================

function selectWeightedCreature(catalog) {
  if (!catalog.length) return null;

  const byRarity = new Map();
  for (const creature of catalog) {
    const key = (creature.rarity || "").trim();
    if (!byRarity.has(key)) {
      byRarity.set(key, []);
    }
    byRarity.get(key).push(creature);
  }

  const availableWeights = RARITY_SPAWN_WEIGHTS.filter(
    entry => (byRarity.get(entry.rarity)?.length || 0) > 0
  );

  if (!availableWeights.length) {
    return randomItem(catalog);
  }

  const totalWeight = availableWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosenRarity = availableWeights[0].rarity;

  for (const entry of availableWeights) {
    if (roll < entry.weight) {
      chosenRarity = entry.rarity;
      break;
    }
    roll -= entry.weight;
  }

  const pool = byRarity.get(chosenRarity);
  return randomItem(pool);
}

function randomSpawnDelay() {
  return Math.floor(
    SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS)
  );
}

function scheduleNextSpawn() {
  if (spawnTimer) clearTimeout(spawnTimer);

  spawnTimer = setTimeout(async () => {
    try {
      const servers = db.prepare(`
        SELECT guild_id, channel_id
        FROM creature_spawn_channels
        WHERE enabled = 1
      `).all();

      for (const server of servers) {
        await spawnCreature(server.guild_id, server.channel_id);
      }
    } catch (error) {
      console.error("Automatic creature spawn error:", error);
    }

    scheduleNextSpawn();
  }, randomSpawnDelay());
}

async function expireCreatureSpawn(spawnId, channelId, creatureName, delay) {
  setTimeout(async () => {
    const expired = db.prepare(`
      UPDATE creature_spawns
      SET status = 'expired'
      WHERE id = ?
        AND status = 'active'
    `).run(spawnId);

    if (expired.changes) {
      const channel = await client.channels.fetch(channelId).catch(() => null);

      if (channel?.isTextBased()) {
        await channel.send({
          content: `🌙 **${creatureName}** slipped back into the Hollow. Better luck next time!`
        }).catch(() => {});
      }
    }
  }, Math.max(0, delay));
}

async function spawnCreature(guildId, channelId) {
  const now = new Date();

  const active = db.prepare(`
    SELECT id
    FROM creature_spawns
    WHERE guild_id = ?
      AND status = 'active'
      AND expires_at > ?
    LIMIT 1
  `).get(guildId, now.toISOString());

  if (active) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);

  if (!channel || !channel.isTextBased() || !channel.send) {
    console.log(`Creature spawn channel unavailable for server ${guildId}`);
    return false;
  }

  const catalog = db.prepare(`
    SELECT *
    FROM creature_catalog
  `).all();

  if (!catalog.length) {
    console.error("Creature catalog is empty.");
    return false;
  }

  const creature = selectWeightedCreature(catalog);
  const expires = new Date(now.getTime() + SPAWN_LIFETIME_MS);

  const result = db.prepare(`
    INSERT INTO creature_spawns (
      guild_id,
      channel_id,
      creature_id,
      status,
      spawned_at,
      expires_at
    )
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(
    guildId,
    channelId,
    creature.creature_id,
    now.toISOString(),
    expires.toISOString()
  );

  const spawnId = Number(result.lastInsertRowid);

  try {
    const image = creatureImage(creature.creature_id);

    const embed = makeEmbed(
      "🌲 A WILD CREATURE HAS APPEARED!",
      `Something is moving in the Hollow...\n\n` +
      `**${creature.creature_name}**\n` +
      `*${creature.rarity} ${creature.creature_type}*\n\n` +
      `${creature.description}\n\n` +
      "Use **/catch** to try to catch it! (65% catch chance)\n" +
      "The first successful catch wins. You have five minutes.",
      COLORS.crimson
    );

    if (image) {
      embed.setImage(`attachment://${creature.creature_id}.png`);
    }

    const message = await channel.send({
      embeds: [embed],
      ...(image ? { files: [image] } : {})
    });

    db.prepare(`
      UPDATE creature_spawns
      SET message_id = ?
      WHERE id = ?
    `).run(message.id, spawnId);

    expireCreatureSpawn(
      spawnId,
      channelId,
      creature.creature_name,
      SPAWN_LIFETIME_MS
    );

    return true;
  } catch (error) {
    db.prepare(`
      UPDATE creature_spawns
      SET status = 'expired'
      WHERE id = ?
    `).run(spawnId);

    console.error("Could not post creature spawn:", error);
    return false;
  }
}

function restoreCreatureSpawns() {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE creature_spawns
    SET status = 'expired'
    WHERE status = 'active'
      AND expires_at <= ?
  `).run(now);

  const activeSpawns = db.prepare(`
    SELECT s.id, s.channel_id, s.expires_at, c.creature_name
    FROM creature_spawns s
    JOIN creature_catalog c ON c.creature_id = s.creature_id
    WHERE s.status = 'active'
      AND s.expires_at > ?
  `).all(now);

  for (const spawn of activeSpawns) {
    const remaining = new Date(spawn.expires_at).getTime() - Date.now();

    expireCreatureSpawn(
      spawn.id,
      spawn.channel_id,
      spawn.creature_name,
      remaining
    );
  }

  scheduleNextSpawn();
}

// ==========================================
// 🐉 CREATURE COMMANDS
// ==========================================

async function handleCreatureCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (subcommand === "collection") {
    const rows = db.prepare(`
      SELECT c.*, uc.discovered_at
      FROM user_creatures uc
      JOIN creature_catalog c
        ON c.creature_id = uc.creature_id
      WHERE uc.user_id = ?
      ORDER BY
        CASE c.rarity
          WHEN 'Mythic' THEN 1
          WHEN 'Legendary' THEN 2
          WHEN 'Ultra Rare' THEN 3
          WHEN 'Rare' THEN 4
          WHEN 'Uncommon' THEN 5
          WHEN 'Common' THEN 6
          ELSE 7
        END,
        c.creature_name
    `).all(userId);

    const total = db.prepare(`
      SELECT COUNT(*) AS n
      FROM creature_catalog
    `).get().n;

    const description = rows.length
      ? rows.map(creature =>
          `**${creature.creature_name}** · ${creature.rarity} ${creature.creature_type}`
        ).join("\n")
      : "Your collection is waiting for its first visitor. Keep an eye out for wild spawns!";

    await interaction.reply({
      embeds: [
        makeEmbed(
          `🐉 ${interaction.user.username}'s Hollow Companions`,
          `${description}\n\n**Collection:** ${rows.length}/${total}`,
          COLORS.charcoal
        )
      ],
      ephemeral: true
    });

    return;
  }

  if (subcommand === "profile") {
    const name = interaction.options.getString("creature", true).trim();

    const creature = db.prepare(`
      SELECT *
      FROM creature_catalog
      WHERE lower(creature_name) = lower(?)
         OR lower(creature_id) = lower(?)
    `).get(name, name);

    if (!creature) {
      await interaction.reply({
        content: "I couldn't find that creature in the Hollow catalog.",
        ephemeral: true
      });
      return;
    }

    const owned = db.prepare(`
      SELECT 1
      FROM user_creatures
      WHERE user_id = ?
        AND creature_id = ?
    `).get(userId, creature.creature_id);

    const image = creatureImage(creature.creature_id);

    const embed = makeEmbed(
      `🐉 ${creature.creature_name}`,
      `**Type:** ${creature.creature_type}\n` +
      `**Rarity:** ${creature.rarity}\n` +
      `**Catch chance:** ${Math.round(UNIVERSAL_CATCH_CHANCE * 100)}%\n` +
      `**In your collection:** ${owned ? "Yes!" : "Not yet"}\n\n` +
      creature.description,
      COLORS.charcoal
    );

    if (image) {
      embed.setImage(`attachment://${creature.creature_id}.png`);
    }

    await interaction.reply({
      embeds: [embed],
      ...(image ? { files: [image] } : {}),
      ephemeral: true
    });

    return;
  }

  if (["setchannel", "start", "stop", "spawn"].includes(subcommand)) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({
        content: "Only members with Manage Server permission can manage creature spawns.",
        ephemeral: true
      });
      return;
    }

    if (subcommand === "setchannel") {
      const channel = interaction.options.getChannel("channel", true);

      if (!channel.isTextBased() || !channel.send) {
        await interaction.reply({
          content: "Please choose a text channel.",
          ephemeral: true
        });
        return;
      }

      db.prepare(`
        INSERT INTO creature_spawn_channels (
          guild_id,
          channel_id,
          enabled,
          updated_at
        )
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          updated_at = CURRENT_TIMESTAMP
      `).run(guildId, channel.id);

      await interaction.reply({
        content: `🌲 Creature spawn channel set to ${channel}. Use \`/creatures start\` when you're ready.`,
        ephemeral: true
      });

      return;
    }

    if (subcommand === "start") {
      const config = db.prepare(`
        SELECT channel_id
        FROM creature_spawn_channels
        WHERE guild_id = ?
      `).get(guildId);

      if (!config) {
        await interaction.reply({
          content: "Set a spawn channel first with `/creatures setchannel`.",
          ephemeral: true
        });
        return;
      }

      db.prepare(`
        UPDATE creature_spawn_channels
        SET enabled = 1,
            updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ?
      `).run(guildId);

      await interaction.reply({
        content: "🦇 Automatic creature spawning is now active! Wild creatures will appear every 20–40 minutes.",
        ephemeral: true
      });

      await spawnCreature(guildId, config.channel_id);
      return;
    }

    if (subcommand === "stop") {
      db.prepare(`
        UPDATE creature_spawn_channels
        SET enabled = 0,
            updated_at = CURRENT_TIMESTAMP
        WHERE guild_id = ?
      `).run(guildId);

      await interaction.reply({
        content: "🌙 Automatic creature spawning has been paused.",
        ephemeral: true
      });

      return;
    }

    if (subcommand === "spawn") {
      const config = db.prepare(`
        SELECT channel_id
        FROM creature_spawn_channels
        WHERE guild_id = ?
      `).get(guildId);

      if (!config) {
        await interaction.reply({
          content: "Set a spawn channel first with `/creatures setchannel`.",
          ephemeral: true
        });
        return;
      }

      await interaction.deferReply({ ephemeral: true });

      const spawned = await spawnCreature(guildId, config.channel_id);

      await interaction.editReply(
        spawned
          ? "✨ A creature has been spawned in the configured channel!"
          : "There is already an active creature, or the spawn channel is unavailable."
      );

      return;
    }
  }
}

// ==========================================
// 🪤 CATCH SYSTEM (UNIVERSAL 65% CATCH CHANCE)
// ==========================================

function attemptCatch(userId, guildId, channelId) {
  const now = new Date().toISOString();

  const spawn = db.prepare(`
    SELECT
      s.*,
      c.creature_name,
      c.creature_type,
      c.rarity,
      c.description,
      c.catch_chance
    FROM creature_spawns s
    JOIN creature_catalog c ON c.creature_id = s.creature_id
    WHERE s.guild_id = ?
      AND s.channel_id = ?
      AND s.status = 'active'
      AND s.expires_at > ?
    ORDER BY s.id DESC
    LIMIT 1
  `).get(guildId, channelId, now);

  if (!spawn) {
    return { result: "none" };
  }

  const transaction = db.transaction(() => {
    const alreadyTried = db.prepare(`
      SELECT 1
      FROM creature_spawn_attempts
      WHERE spawn_id = ?
        AND user_id = ?
    `).get(spawn.id, userId);

    if (alreadyTried) {
      return { result: "tried", spawn };
    }

    const stillActive = db.prepare(`
      SELECT 1
      FROM creature_spawns
      WHERE id = ?
        AND status = 'active'
        AND expires_at > ?
    `).get(spawn.id, now);

    if (!stillActive) {
      return { result: "gone", spawn };
    }

    const chance = UNIVERSAL_CATCH_CHANCE;
    const success = Math.random() < chance;

    db.prepare(`
      INSERT INTO creature_spawn_attempts (
        spawn_id,
        user_id,
        success
      )
      VALUES (?, ?, ?)
    `).run(spawn.id, userId, success ? 1 : 0);

    if (!success) {
      return {
        result: "failed",
        spawn,
        chance: Math.round(chance * 100)
      };
    }

    const claimed = db.prepare(`
      UPDATE creature_spawns
      SET status = 'caught',
          caught_by = ?,
          caught_at = ?
      WHERE id = ?
        AND status = 'active'
        AND expires_at > ?
    `).run(userId, now, spawn.id, now);

    if (!claimed.changes) {
      return { result: "lost", spawn };
    }

    const added = db.prepare(`
      INSERT OR IGNORE INTO user_creatures (user_id, creature_id)
      VALUES (?, ?)
    `).run(userId, spawn.creature_id);

    return {
      result: "caught",
      spawn,
      added: added.changes > 0
    };
  });

  return transaction();
}

// ==========================================
// 🔒 JAIL SYSTEM
// ==========================================

function jailRoleId() {
  return process.env.JAILBIRD_ROLE_ID;
}

async function handleJail(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "You need Manage Roles permission to use Nest Jail.",
      ephemeral: true
    });
    return;
  }

  const roleId = jailRoleId();

  if (!roleId) {
    await interaction.reply({
      content: "The JAILBIRD_ROLE_ID environment variable is missing in Railway.",
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason") || "No reason provided.";

  if (targetUser.id === interaction.user.id) {
    await interaction.reply({
      content: "You cannot send yourself to Nest Jail.",
      ephemeral: true
    });
    return;
  }

  if (targetUser.id === client.user.id) {
    await interaction.reply({
      content: "Hootie cannot be jailed. Who would run the Nest?",
      ephemeral: true
    });
    return;
  }

  const guild = interaction.guild;
  const target = await guild.members.fetch(targetUser.id).catch(() => null);
  const role = guild.roles.cache.get(roleId);
  const botMember = await guild.members.fetchMe().catch(() => null);

  if (!target || !role || !botMember) {
    await interaction.reply({
      content: "I couldn't find the member, jail role, or bot permissions.",
      ephemeral: true
    });
    return;
  }

  if (target.id === guild.ownerId) {
    await interaction.reply({
      content: "The server owner cannot be jailed.",
      ephemeral: true
    });
    return;
  }

  if (
    target.roles.highest.position >= botMember.roles.highest.position ||
    role.position >= botMember.roles.highest.position
  ) {
    await interaction.reply({
      content: "My role must be higher than the member and the jail role.",
      ephemeral: true
    });
    return;
  }

  if (target.roles.cache.has(roleId)) {
    await interaction.reply({
      content: "That member is already in Nest Jail.",
      ephemeral: true
    });
    return;
  }

  const jailedAt = new Date();
  const releaseAt = new Date(jailedAt.getTime() + minutes * 60 * 1000);

  await target.roles.add(role, `Nest Jail: ${reason}`);

  db.prepare(`
    INSERT INTO jail_sentences (
      user_id,
      guild_id,
      moderator_id,
      reason,
      jailed_at,
      release_at
    )
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      guild_id = excluded.guild_id,
      moderator_id = excluded.moderator_id,
      reason = excluded.reason,
      jailed_at = excluded.jailed_at,
      release_at = excluded.release_at
  `).run(
    target.id,
    guild.id,
    interaction.user.id,
    reason,
    jailedAt.toISOString(),
    releaseAt.toISOString()
  );

  await interaction.reply({
    embeds: [
      makeEmbed(
        "🦇 WELCOME TO NEST JAIL",
        `${target} has been sent to Nest Jail for **${minutes} minutes**.\n\n` +
        `**Reason:** ${reason}\n` +
        `**Release:** <t:${Math.floor(releaseAt.getTime() / 1000)}:R>`,
        COLORS.crimson
      )
    ]
  });
}

async function releaseJailedMember(guild, userId, announce = true) {
  const sentence = db.prepare(`
    SELECT *
    FROM jail_sentences
    WHERE user_id = ?
      AND guild_id = ?
  `).get(userId, guild.id);

  if (!sentence) return false;

  const roleId = jailRoleId();

  if (!roleId) {
    console.error("Cannot release jailed member: JAILBIRD_ROLE_ID is missing.");
    return false;
  }

  const member = await guild.members.fetch(userId).catch(() => null);

  if (!member) {
    db.prepare(`
      DELETE FROM jail_sentences
      WHERE user_id = ?
    `).run(userId);

    return true;
  }

  if (member.roles.cache.has(roleId)) {
    try {
      await member.roles.remove(roleId, "Nest Jail sentence completed");
    } catch (error) {
      console.error(`Could not release ${userId} from jail:`, error);
      return false;
    }
  }

  db.prepare(`
    DELETE FROM jail_sentences
    WHERE user_id = ?
  `).run(userId);

  if (announce) {
    const channel = guild.systemChannel;

    if (channel) {
      await channel.send({
        embeds: [
          makeEmbed(
            "🔓 RELEASED FROM NEST JAIL",
            `${member} has served their time and is free to return to The Nest!`,
            COLORS.silver
          )
        ]
      }).catch(() => {});
    }
  }

  return true;
}

async function handleRelease(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "You need Manage Roles permission to release someone.",
      ephemeral: true
    });
    return;
  }

  const target = interaction.options.getUser("member", true);

  const released = await releaseJailedMember(
    interaction.guild,
    target.id,
    true
  );

  await interaction.reply({
    content: released
      ? `🔓 ${target} has been released from Nest Jail.`
      : "That member does not have an active saved jail sentence, or I could not remove the jail role.",
    ephemeral: true
  });
}

async function checkJailSentences() {
  const due = db.prepare(`
    SELECT *
    FROM jail_sentences
    WHERE release_at <= ?
  `).all(new Date().toISOString());

  for (const sentence of due) {
    const guild = await client.guilds.fetch(sentence.guild_id).catch(() => null);

    if (!guild) continue;

    await releaseJailedMember(guild, sentence.user_id, true);
  }
}

// ==========================================
// 🔄 RESTORE ACTIVE GAMES ON STARTUP
// ==========================================

function restoreActiveChannelGames() {
  // Ensure any legacy active Last Letter or Story rounds are mirrored in arcade_active_games
  const lastLetterRows = db.prepare(`
    SELECT guild_id, channel_id
    FROM arcade_lastletter_state
  `).all();

  for (const row of lastLetterRows) {
    db.prepare(`
      INSERT OR IGNORE INTO arcade_active_games (
        guild_id,
        channel_id,
        game_type,
        started_by,
        state_json
      )
      VALUES (?, ?, 'lastletter', '', '{}')
    `).run(row.guild_id, row.channel_id);
  }

  const storyRows = db.prepare(`
    SELECT guild_id, channel_id, session_id, started_by
    FROM arcade_story_sessions
  `).all();

  for (const row of storyRows) {
    db.prepare(`
      INSERT OR IGNORE INTO arcade_active_games (
        guild_id,
        channel_id,
        game_type,
        started_by,
        state_json
      )
      VALUES (?, ?, 'story', ?, ?)
    `).run(
      row.guild_id,
      row.channel_id,
      row.started_by || "",
      JSON.stringify({ sessionId: row.session_id })
    );
  }

  const activeCount = db.prepare(`
    SELECT COUNT(*) AS n
    FROM arcade_active_games
  `).get().n;

  console.log(`🎮 Restored ${activeCount} active community game(s) from SQLite`);
}

// ==========================================
// 🦉 INTERACTION HANDLER
// ==========================================

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isAutocomplete()) {
      if (
        interaction.commandName === "timezone" &&
        interaction.options.getSubcommand() === "set"
      ) {
        const query = interaction.options.getFocused().toLowerCase();

        await interaction.respond(
          TIMEZONES
            .filter(zone => zone.toLowerCase().includes(query))
            .slice(0, 25)
            .map(zone => ({ name: zone, value: zone }))
        );
      }

      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith("hootie:")) {
        const tab = interaction.customId.split(":")[1];

        if (!["overview", "activities", "badges", "challenges"].includes(tab)) {
          return;
        }

        const stats = getStats(interaction.user.id);

        await interaction.update(
          dashboardPayload(interaction.user, stats, tab)
        );
      }

      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;

    ensureUser(userId);

    // ======================================
    // 🖤 THE NEST
    // ======================================

    if (interaction.commandName === "nest") {
      await interaction.reply({
        embeds: [
          makeEmbed(
            "🖤 Welcome to The Nest",
            "A cozy corner of the Hollow for wellness, growth, games, and a little midnight mischief.\n\n" +
            "Use `/wellness` to open your Nest Archives and `/arcade` to visit the Midnight Arcade.",
            COLORS.charcoal
          )
        ]
      });
      return;
    }

    if (interaction.commandName === "ping") {
      await interaction.reply({
        embeds: [
          makeEmbed(
            "🦉 Hootie is awake!",
            `Pong! ${client.ws.ping}ms`,
            COLORS.crimson
          )
        ],
        ephemeral: true
      });
      return;
    }

    // ======================================
    // 🪺 DAILY WELLNESS CHECK-IN
    // ======================================

    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response", true);
      const visibility = interaction.options.getString("visibility", true);

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
        streak =
          streakRow.last_checkin_date === previousDate(today)
            ? streak + 1
            : 1;

        db.prepare(`
          INSERT INTO wellness_checkins (
            user_id,
            response,
            visibility,
            checkin_date,
            timezone_used,
            reward_earned
          )
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(userId, response, visibility, today, timezone);

        db.prepare(`
          INSERT INTO wellness_streaks (
            user_id,
            current_streak,
            longest_streak,
            last_checkin_date
          )
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            current_streak = excluded.current_streak,
            longest_streak = MAX(
              wellness_streaks.longest_streak,
              excluded.longest_streak
            ),
            last_checkin_date = excluded.last_checkin_date
        `).run(
          userId,
          streak,
          Math.max(streak, streakRow.longest_streak || 0),
          today
        );

        addWellnessPoints(userId, 10);
      } else {
        db.prepare(`
          INSERT INTO wellness_checkins (
            user_id,
            response,
            visibility,
            checkin_date,
            timezone_used,
            reward_earned
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
        ephemeral: visibility === "private"
      });

      if (badges.length || challenges.length) {
        const extra = [
          ...badges.map(badge => `🏅 **New badge:** ${badge.name}`),
          ...challenges.map(name => `🏆 **Challenge completed:** ${name}`)
        ].join("\n");

        await interaction.followUp({
          content: extra,
          ephemeral: true
        });
      }

      return;
    }

    // ======================================
    // 💧 WELLNESS ACTIVITIES
    // ======================================

    const activityCommands = {
      water: { type: "water", option: "cups" },
      steps: { type: "steps", option: "count" },
      sleep: { type: "sleep", option: "hours" },
      selfcare: { type: "selfcare", option: "activity" },
      workout: { type: "workout", option: "activity" }
    };

    if (activityCommands[interaction.commandName]) {
      const config = activityCommands[interaction.commandName];

      const activityValue =
        interaction.options.get(config.option).value;

      const pointsAwarded = recordActivity(
        userId,
        config.type,
        activityValue
      );

      if (config.type === "workout") {
        const minutes = interaction.options.getInteger("minutes");

        if (minutes) {
          db.prepare(`
            INSERT INTO wellness_logs (
              user_id,
              activity_type,
              activity_value,
              activity_date,
              points_awarded
            )
            VALUES (?, 'workout_minutes', ?, ?, 0)
          `).run(
            userId,
            String(minutes),
            localDate(getTimezone(userId))
          );
        }
      }

      const badges = awardBadges(userId);
      const challenges = evaluateChallenges(userId);

      let shown;

      if (config.type === "water") {
        shown = `${Number(activityValue)} ${Number(activityValue) === 1 ? "cup" : "cups"} of water`;
      } else if (config.type === "steps") {
        shown = `${Number(activityValue).toLocaleString()} steps`;
      } else if (config.type === "sleep") {
        shown = `${activityValue} hours of sleep`;
      } else {
        shown = activityValue;
      }

      const minutes = config.type === "workout"
        ? interaction.options.getInteger("minutes")
        : null;

      let message =
        `🦉 <@${userId}> logged **${shown}**!\n` +
        `+${pointsAwarded} Wellness Points`;

      if (config.type === "water") {
        const earnedToday = db.prepare(`
          SELECT COALESCE(SUM(points_awarded), 0) AS total
          FROM wellness_logs
          WHERE user_id = ?
            AND activity_type = 'water'
            AND activity_date = ?
        `).get(userId, localDate(getTimezone(userId))).total;

        message += `\n💧 Daily water points: **${earnedToday}/20**`;
      }

      if (minutes) {
        message += `\n⏱️ Movement duration: **${minutes} minutes**`;
      }

      if (badges.length) {
        message += `\n🏅 New badge: ${badges.map(b => b.name).join(", ")}`;
      }

      if (challenges.length) {
        message += `\n🏆 Challenge completed: ${challenges.join(", ")}`;
      }

      await interaction.reply({
        embeds: [
          makeEmbed(
            "🌙 WELLNESS LOG UPDATED",
            message,
            COLORS.burgundy
          )
        ]
      });

      return;
    }

    // ======================================
    // 📖 PERSONAL WELLNESS DASHBOARD
    // ======================================

    if (interaction.commandName === "wellness") {
      const member =
        interaction.options.getUser("member") || interaction.user;

      const stats = getStats(member.id);

      if (member.id === userId) {
        await interaction.reply({
          ...dashboardPayload(member, stats),
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        embeds: [publicWellnessEmbed(member, stats)],
        ephemeral: true
      });

      return;
    }

    // ======================================
    // 🏆 LEADERBOARDS
    // ======================================

    if (interaction.commandName === "leaderboard") {
      const ranking = interaction.options.getString("ranking", true);

      if (ranking === "arcade") {
        const rows = db.prepare(`
          SELECT user_id, points AS score
          FROM arcade_points
          ORDER BY score DESC
          LIMIT 10
        `).all();

        const lines = rows.length
          ? rows.map((row, index) =>
              `**${index + 1}.** <@${row.user_id}> — **${row.score} Arcade Points**`
            ).join("\n")
          : "No arcade scores yet. Be the first to play!";

        await interaction.reply({
          embeds: [
            makeEmbed("🦇 MIDNIGHT ARCADE LEADERBOARD", lines, COLORS.charcoal)
          ]
        });

        return;
      }

      const period = ranking === "weekly"
        ? "weekly_points"
        : "lifetime_points";

      const title = ranking === "weekly"
        ? "Weekly Wellness Points"
        : "Lifetime Owl XP";

      const rows = db.prepare(`
        SELECT user_id, ${period} AS score
        FROM users
        ORDER BY score DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((row, index) =>
            `**${index + 1}.** <@${row.user_id}> — **${row.score}**`
          ).join("\n")
        : "No scores yet. Be the first to soar!";

      await interaction.reply({
        embeds: [
          makeEmbed(`🏆 ${title}`, lines)
        ]
      });

      return;
    }

    // ======================================
    // 🏅 WEEKLY CHALLENGES
    // ======================================

    if (interaction.commandName === "challenges") {
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
        embeds: [
          makeEmbed("🏆 THIS WEEK IN THE NEST", lines)
        ],
        ephemeral: true
      });

      return;
    }

    // ======================================
    // 🕒 TIME ZONE
    // ======================================

    if (interaction.commandName === "timezone") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "set") {
        const zone = interaction.options.getString("zone", true);

        try {
          new Intl.DateTimeFormat("en-US", { timeZone: zone });
        } catch {
          await interaction.reply({
            content: "That time zone isn't valid. Please choose one from the suggestions.",
            ephemeral: true
          });
          return;
        }

        db.prepare(`
          INSERT INTO user_timezones (
            user_id,
            timezone,
            updated_at
          )
          VALUES (?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET
            timezone = excluded.timezone,
            updated_at = CURRENT_TIMESTAMP
        `).run(userId, zone);

        await interaction.reply({
          content: `🕒 Your Nest time zone is now **${zone}**.`,
          ephemeral: true
        });
      } else {
        await interaction.reply({
          content: `Your saved time zone is **${getTimezone(userId)}**.`,
          ephemeral: true
        });
      }

      return;
    }

    // ======================================
    // 🦇 MIDNIGHT ARCADE
    // ======================================

    if (interaction.commandName === "arcade") {
      await showArcade(interaction);
      return;
    }

    if (interaction.commandName === "lastletter") {
      await handleLastLetterCommand(interaction);
      return;
    }

    if (interaction.commandName === "madlibs") {
      await handleMadlibsCommand(interaction);
      return;
    }

    // ======================================
    // 🐉 CREATURES
    // ======================================

    if (interaction.commandName === "creatures") {
      await handleCreatureCommand(interaction);
      return;
    }

    if (interaction.commandName === "catch") {
      if (!interaction.guildId) {
        await interaction.reply({
          content: "Creature catching is only available inside The Nest.",
          ephemeral: true
        });
        return;
      }

      const result = attemptCatch(
        userId,
        interaction.guildId,
        interaction.channelId
      );

      if (result.result === "none") {
        await interaction.reply({
          content: "🌙 There are no wild creatures here right now. Keep watch for the next spawn!",
          ephemeral: true
        });
        return;
      }

      if (result.result === "tried") {
        await interaction.reply({
          content: "You've already tried to catch this creature. Give another night owl a chance!",
          ephemeral: true
        });
        return;
      }

      if (result.result === "gone") {
        await interaction.reply({
          content: "That creature has already disappeared into the Hollow.",
          ephemeral: true
        });
        return;
      }

      if (result.result === "lost") {
        await interaction.reply({
          content: "Another night owl caught it first!",
          ephemeral: true
        });
        return;
      }

      if (result.result === "failed") {
        await interaction.reply({
          embeds: [
            makeEmbed(
              "🍃 THE CREATURE ESCAPED!",
              `**${result.spawn.creature_name}** slipped away!\n\n` +
              `Your catch chance was ${result.chance}%.\n` +
              `You cannot retry this particular spawn, but another creature may appear soon.`,
              COLORS.charcoal
            )
          ],
          ephemeral: true
        });
        return;
      }

      if (result.result === "caught") {
        if (result.added) {
          recordArcadeGame(
            userId,
            "creature_catch",
            10,
            `Caught ${result.spawn.creature_name}`
          );
        }

        await interaction.reply({
          embeds: [
            makeEmbed(
              "✨ CREATURE CAUGHT!",
              `🎉 <@${userId}> caught **${result.spawn.creature_name}**!\n\n` +
              `*${result.spawn.rarity} ${result.spawn.creature_type}*\n` +
              `${result.spawn.description}\n\n` +
              (result.added
                ? "Added to your collection! +10 Arcade Points."
                : "You already owned this creature, but you won the catch!"),
              COLORS.crimson
            )
          ]
        });

        return;
      }
    }

    // ======================================
    // 🏆 ARCADE LEADERBOARD
    // ======================================

    if (interaction.commandName === "arcadeleaderboard") {
      const rows = db.prepare(`
        SELECT user_id, points
        FROM arcade_points
        ORDER BY points DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((row, index) =>
            `**${index + 1}.** <@${row.user_id}> — **${row.points} Arcade Points**`
          ).join("\n")
        : "No arcade scores yet. Start the fun!";

      await interaction.reply({
        embeds: [
          makeEmbed(
            "🦇 MIDNIGHT ARCADE LEADERBOARD",
            lines,
            COLORS.charcoal
          )
        ]
      });

      return;
    }

    // ======================================
    // 🔒 JAIL
    // ======================================

    if (interaction.commandName === "jail") {
      await handleJail(interaction);
      return;
    }

    if (interaction.commandName === "release") {
      await handleRelease(interaction);
      return;
    }

  } catch (error) {
    console.error("Interaction error:", error);

    const message = {
      content: "🖤 Hootie hit a little snag. Please try again, and check the Railway logs if it continues.",
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
});

// ==========================================
// 🦉 REGISTER SLASH COMMANDS
// ==========================================

async function registerCommands() {
  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: commands }
  );

  console.log("🦉 Slash commands registered!");
}

// ==========================================
// 🖤 STARTUP
// ==========================================

client.once(Events.ClientReady, async readyClient => {
  console.log(`🖤 HOOTIE 2.0 IS ONLINE — ${readyClient.user.tag}`);

  try {
    for (const user of db.prepare(`
      SELECT user_id
      FROM users
    `).all()) {
      resetWeeklyPoints(
        user.user_id,
        weekStart(localDate(getTimezone(user.user_id)))
      );
    }

    const today = localDate("America/Los_Angeles");
    ensureWeeklyChallenges(weekStart(today));

    restoreActiveChannelGames();
    restoreCreatureSpawns();

    await checkJailSentences();

    setInterval(() => {
      checkJailSentences().catch(error =>
        console.error("Jail release checker error:", error)
      );
    }, 30 * 1000);

    await registerCommands();

    console.log("🪺 Wellness system ready");
    console.log("🦇 Midnight Arcade ready");
    console.log("📖 Chat-based Community Madlibs ready");
    console.log("📜 Chat-based Continue the Story ready");
    console.log("📝 Chat-based Last Letter ready");
    console.log("🐉 Creature spawning system ready");
    console.log("🔒 Jail sentence checker ready");

  } catch (error) {
    console.error("Startup task failed:", error);
  }
});

client.login(process.env.DISCORD_TOKEN);
