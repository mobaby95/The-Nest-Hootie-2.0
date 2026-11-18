const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ==========================================
// 🖤 DATABASE CONNECTION
// ==========================================

const databasePath =
  process.env.DATABASE_PATH || "./data/hootie.sqlite";

fs.mkdirSync(path.dirname(databasePath), {
  recursive: true
});

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ==========================================
// 🪺 WELLNESS + 🦇 ARCADE TABLES
// ==========================================

db.exec(`
  // ========================================
  // MEMBERS
  // ========================================

  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    wellness_points INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  // ========================================
  // WELLNESS ACTIVITY
  // ========================================

  CREATE TABLE IF NOT EXISTS wellness_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wellness_checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    response TEXT NOT NULL,
    visibility TEXT NOT NULL,
    checkin_date TEXT NOT NULL,
    timezone_used TEXT,
    reward_earned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wellness_streaks (
    user_id TEXT PRIMARY KEY,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_checkin_date TEXT
  );

  CREATE TABLE IF NOT EXISTS user_timezones (
    user_id TEXT PRIMARY KEY,
    timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  // ========================================
  // WELLNESS BADGES + CHALLENGES
  // ========================================

  CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    badge_id TEXT NOT NULL,
    earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS weekly_challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    target REAL NOT NULL,
    reward_points INTEGER NOT NULL,
    UNIQUE(week_start, challenge_id)
  );

  CREATE TABLE IF NOT EXISTS user_challenge_completions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    week_start TEXT NOT NULL,
    challenge_id TEXT NOT NULL,
    completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, week_start, challenge_id)
  );

  // ========================================
  // ARCADE POINTS
  // SEPARATE FROM WELLNESS POINTS
  // ========================================

  CREATE TABLE IF NOT EXISTS arcade_points (
    user_id TEXT PRIMARY KEY,
    points INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS arcade_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    points INTEGER NOT NULL,
    reason TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS arcade_game_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    played_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  // ========================================
  // LAST LETTER GAME
  // ========================================

  CREATE TABLE IF NOT EXISTS arcade_lastletter_state (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    current_letter TEXT,
    last_player_id TEXT,
    used_words TEXT DEFAULT '[]',
    round_count INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );

  // ========================================
  // COMMUNITY STORY GAME
  // ========================================

  CREATE TABLE IF NOT EXISTS arcade_story_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contribution TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  // ========================================
  // MADLIBS GAME HISTORY
  // ========================================

  CREATE TABLE IF NOT EXISTS arcade_madlibs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    channel_id TEXT,
    user_id TEXT NOT NULL,
    story_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  // ========================================
  // ORIGINAL COLLECTIBLE CREATURES
  // ========================================

  CREATE TABLE IF NOT EXISTS creature_catalog (
    creature_id TEXT PRIMARY KEY,
    creature_name TEXT NOT NULL,
    creature_type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    description TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_creatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    nickname TEXT,
    discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, creature_id)
  );

  // ========================================
  // MODERATION
  // ========================================

  CREATE TABLE IF NOT EXISTS jail_sentences (
    user_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    jailed_at TEXT NOT NULL,
    release_at TEXT NOT NULL
  );
`);

// ==========================================
// 🔧 SAFE DATABASE MIGRATIONS
// ==========================================

function ensureColumn(table, column, definition) {
  const columns = db.pragma(`table_info(${table})`);

  if (!columns.some(item => item.name === column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  }
}

// Existing Wellness scoring fields
ensureColumn("users", "weekly_points", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "weekly_period", "TEXT");

// Existing activity tracking fields
ensureColumn("wellness_logs", "activity_date", "TEXT");
ensureColumn(
  "wellness_logs",
  "points_awarded",
  "INTEGER NOT NULL DEFAULT 0"
);

// Existing check-in fields
ensureColumn("wellness_checkins", "timezone_used", "TEXT");
ensureColumn(
  "wellness_checkins",
  "reward_earned",
  "INTEGER NOT NULL DEFAULT 0"
);

// ==========================================
// 📅 WELLNESS INDEXES
// ==========================================

db.exec(`
  UPDATE wellness_logs
  SET activity_date = COALESCE(
    activity_date,
    substr(created_at, 1, 10)
  )
  WHERE activity_date IS NULL;

  CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_date
  ON wellness_logs(user_id, activity_date, activity_type);

  CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
  ON wellness_checkins(user_id, checkin_date);
`);

// ==========================================
// 🔄 LEGACY CHECK-IN MIGRATION
// Allows multiple check-ins per day while
// preserving existing check-in records.
// ==========================================

const checkinsSchema = db.prepare(`
  SELECT sql
  FROM sqlite_master
  WHERE type = 'table'
    AND name = 'wellness_checkins'
`).get();

if (
  checkinsSchema &&
  checkinsSchema.sql
    .replace(/\s+/g, "")
    .toUpperCase()
    .includes("UNIQUE(USER_ID,CHECKIN_DATE)")
) {
  const oldColumns = db
    .pragma("table_info(wellness_checkins)")
    .map(column => column.name);

  const hasTimezone = oldColumns.includes("timezone_used");
  const hasReward = oldColumns.includes("reward_earned");

  db.transaction(() => {
    db.exec(`
      CREATE TABLE wellness_checkins_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        response TEXT NOT NULL,
        visibility TEXT NOT NULL,
        checkin_date TEXT NOT NULL,
        timezone_used TEXT,
        reward_earned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO wellness_checkins_new (
        id,
        user_id,
        response,
        visibility,
        checkin_date,
        timezone_used,
        reward_earned,
        created_at
      )
      SELECT
        id,
        user_id,
        response,
        visibility,
        checkin_date,
        ${hasTimezone ? "timezone_used" : "NULL"},
        ${hasReward ? "reward_earned" : "1"},
        created_at
      FROM wellness_checkins;

      DROP TABLE wellness_checkins;

      ALTER TABLE wellness_checkins_new
      RENAME TO wellness_checkins;
    `);
  })();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
    ON wellness_checkins(user_id, checkin_date);
  `);
}

// Only one rewarded check-in per user per local date
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_daily_reward
  ON wellness_checkins(user_id, checkin_date)
  WHERE reward_earned = 1;
`);

// ==========================================
// 🦇 ORIGINAL NEST CREATURE CATALOG
// ==========================================

const creatures = [
  {
    id: "gloomlet",
    name: "Gloomlet",
    type: "Shadow",
    rarity: "Common",
    description: "A tiny shadow creature that loves moonlit corners."
  },
  {
    id: "cindercrow",
    name: "Cindercrow",
    type: "Fire",
    rarity: "Common",
    description: "A mischievous little bird with glowing ember feathers."
  },
  {
    id: "moonmoth",
    name: "Moonmoth",
    type: "Moon",
    rarity: "Common",
    description: "A gentle creature drawn to silver moonlight."
  },
  {
    id: "thornkit",
    name: "Thornkit",
    type: "Nature",
    rarity: "Uncommon",
    description: "A curious forest creature with tiny thorn-covered paws."
  },
  {
    id: "duskwisp",
    name: "Duskwisp",
    type: "Spirit",
    rarity: "Uncommon",
    description: "A floating spirit that appears just before midnight."
  },
  {
    id: "hollowhare",
    name: "Hollowhare",
    type: "Shadow",
    rarity: "Rare",
    description: "A mysterious rabbit that guards forgotten forest paths."
  },
  {
    id: "vesperwing",
    name: "Vesperwing",
    type: "Moon",
    rarity: "Rare",
    description: "An elegant winged creature that follows the evening stars."
  },
  {
    id: "nocturne",
    name: "Nocturne",
    type: "Spirit",
    rarity: "Legendary",
    description: "An ancient guardian said to awaken beneath a crimson moon."
  }
];

const insertCreature = db.prepare(`
  INSERT OR IGNORE INTO creature_catalog (
    creature_id,
    creature_name,
    creature_type,
    rarity,
    description
  )
  VALUES (
    @id,
    @name,
    @type,
    @rarity,
    @description
  )
`);

const seedCreatures = db.transaction(() => {
  for (const creature of creatures) {
    insertCreature.run(creature);
  }
});

seedCreatures();

// ==========================================
// 📊 ARCADE INDEXES
// ==========================================

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_arcade_transactions_user
  ON arcade_transactions(user_id);

  CREATE INDEX IF NOT EXISTS idx_arcade_stats_user
  ON arcade_game_stats(user_id);

  CREATE INDEX IF NOT EXISTS idx_arcade_stats_game
  ON arcade_game_stats(game_name);

  CREATE INDEX IF NOT EXISTS idx_arcade_story_channel
  ON arcade_story_contributions(guild_id, channel_id);

  CREATE INDEX IF NOT EXISTS idx_user_creatures_user
  ON user_creatures(user_id);
`);

// ==========================================
// 🖤 CONNECTION CONFIRMATION
// ==========================================

console.log("🖤 HOOTIE DATABASE CONNECTED");
console.log("Database location: " + databasePath);
console.log("🪺 Wellness database ready");
console.log("🦇 Arcade database ready");
console.log("🐉 Original creature catalog ready");

module.exports = db;
