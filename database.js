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
db.pragma("busy_timeout = 5000");

// ==========================================
// 🔧 SAFE MIGRATION HELPERS
// ==========================================

function hasColumn(table, column) {
  return db.pragma(`table_info(${table})`)
    .some(item => item.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );

    console.log(`🛠️ Added ${table}.${column}`);
    return true;
  }

  return false;
}

// ==========================================
// 🪺 CORE WELLNESS TABLES
// ==========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    wellness_points INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    weekly_points INTEGER DEFAULT 0,
    weekly_period TEXT,
    level INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wellness_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_value TEXT,
    activity_date TEXT,
    points_awarded INTEGER NOT NULL DEFAULT 0,
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
`);

// Preserve the original wellness_points column and migrate its
// existing values into lifetime_points if that column is new.
const addedLifetimePoints = ensureColumn(
  "users",
  "lifetime_points",
  "INTEGER NOT NULL DEFAULT 0"
);

ensureColumn("users", "weekly_points", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "weekly_period", "TEXT");
ensureColumn("users", "level", "INTEGER NOT NULL DEFAULT 0");

if (addedLifetimePoints) {
  db.exec(`
    UPDATE users
    SET lifetime_points = COALESCE(wellness_points, 0)
  `);
}

ensureColumn("wellness_logs", "activity_date", "TEXT");
ensureColumn(
  "wellness_logs",
  "points_awarded",
  "INTEGER NOT NULL DEFAULT 0"
);

ensureColumn("wellness_checkins", "timezone_used", "TEXT");
ensureColumn(
  "wellness_checkins",
  "reward_earned",
  "INTEGER NOT NULL DEFAULT 0"
);

// Backfill dates for existing activity records.
db.exec(`
  UPDATE wellness_logs
  SET activity_date = substr(created_at, 1, 10)
  WHERE activity_date IS NULL;

  CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_date
  ON wellness_logs(user_id, activity_date, activity_type);

  CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
  ON wellness_checkins(user_id, checkin_date);
`);

// ==========================================
// 🔄 LEGACY CHECK-IN MIGRATION
// ==========================================

const checkinsSchema = db.prepare(`
  SELECT sql
  FROM sqlite_master
  WHERE type = 'table'
    AND name = 'wellness_checkins'
`).get();

if (
  checkinsSchema?.sql &&
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

  console.log("🛠️ Legacy check-in table migrated.");
}

// One rewarded check-in per user per local date.
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_daily_reward
  ON wellness_checkins(user_id, checkin_date)
  WHERE reward_earned = 1;
`);

// ==========================================
// 🏅 BADGES + WEEKLY CHALLENGES
// ==========================================

db.exec(`
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
`);

// ==========================================
// 🦇 ARCADE TABLES
// ==========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS arcade_points (
    user_id TEXT PRIMARY KEY,
    points INTEGER NOT NULL DEFAULT 0
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

  CREATE TABLE IF NOT EXISTS arcade_story_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contribution TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS arcade_madlibs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    channel_id TEXT,
    user_id TEXT NOT NULL,
    story_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// ==========================================
// 🐉 CREATURE COLLECTION
// ==========================================

db.exec(`
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

  CREATE TABLE IF NOT EXISTS creature_spawn_channels (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS creature_spawns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    spawned_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    caught_by TEXT,
    caught_at TEXT,
    message_id TEXT
  );

  CREATE TABLE IF NOT EXISTS creature_spawn_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spawn_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(spawn_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_creature_spawns_status
  ON creature_spawns(status, expires_at);

  CREATE INDEX IF NOT EXISTS idx_creature_attempts_spawn
  ON creature_spawn_attempts(spawn_id);
`);

// Existing databases get this column safely.
ensureColumn(
  "creature_catalog",
  "catch_chance",
  "REAL NOT NULL DEFAULT 0.50"
);

// ==========================================
// 🐉 HOOTIE 2.0 CREATURE CATALOG
// ==========================================

// Catch chance is stored as a decimal:
// 0.80 = 80%, 0.10 = 10%, 0.02 = 2%.

const creatures = [
  {
    id: "gloomlet",
    name: "Gloomlet",
    type: "Shadow",
    rarity: "Common",
    description: "A tiny shadow-dweller with curious eyes and a soft midnight glow.",
    catchChance: 0.80
  },
  {
    id: "cindercrow",
    name: "Cindercrow",
    type: "Fire",
    rarity: "Common",
    description: "A soot-feathered crow with a warm ember tucked beneath one wing.",
    catchChance: 0.80
  },
  {
    id: "moonmoth",
    name: "Moonmoth",
    type: "Moon",
    rarity: "Common",
    description: "A gentle moth whose wings shimmer like moonlit silk.",
    catchChance: 0.80
  },
  {
    id: "thornkit",
    name: "Thornkit",
    type: "Nature",
    rarity: "Common",
    description: "A mischievous woodland kitten with tiny leafy thorns.",
    catchChance: 0.80
  },
  {
    id: "duskwisp",
    name: "Duskwisp",
    type: "Spirit",
    rarity: "Uncommon",
    description: "A floating wisp that leaves a trail of violet sparks.",
    catchChance: 0.65
  },
  {
    id: "hollowhare",
    name: "Hollowhare",
    type: "Shadow",
    rarity: "Uncommon",
    description: "A quiet hare that appears only where the forest grows dark.",
    catchChance: 0.65
  },
  {
    id: "vesperwing",
    name: "Vesperwing",
    type: "Moon",
    rarity: "Uncommon",
    description: "A graceful night creature with silver-tipped wings.",
    catchChance: 0.65
  },
  {
    id: "mycelune",
    name: "Mycelune",
    type: "Nature",
    rarity: "Uncommon",
    description: "A small forest guardian crowned with glowing mushrooms.",
    catchChance: 0.65
  },
  {
    id: "belladusk",
    name: "Belladusk",
    type: "Shadow",
    rarity: "Rare",
    description: "A mysterious fox with dusk-colored fur and luminous markings.",
    catchChance: 0.45
  },
  {
    id: "astralith",
    name: "Astralith",
    type: "Starlight",
    rarity: "Ultra Rare",
    description: "A celestial crystal dragon-deer said to carry fragments of the night sky.",
    catchChance: 0.25
  },
  {
    id: "nocturne",
    name: "Nocturne",
    type: "Spirit",
    rarity: "Legendary",
    description: "An ancient spirit companion whose song echoes through the Hollow.",
    catchChance: 0.10
  },
  {
    id: "diva",
    name: "Diva",
    type: "Moon",
    rarity: "Mythic",
    description: "A beloved black-and-white Cockapoo with a moonlit aura and a heart of pure mischief.",
    catchChance: 0.02
  }
];

const upsertCreature = db.prepare(`
  INSERT INTO creature_catalog (
    creature_id,
    creature_name,
    creature_type,
    rarity,
    description,
    catch_chance
  )
  VALUES (
    @id,
    @name,
    @type,
    @rarity,
    @description,
    @catchChance
  )
  ON CONFLICT(creature_id) DO UPDATE SET
    creature_name = excluded.creature_name,
    creature_type = excluded.creature_type,
    rarity = excluded.rarity,
    description = excluded.description,
    catch_chance = excluded.catch_chance
`);

db.transaction(() => {
  for (const creature of creatures) {
    upsertCreature.run(creature);
  }
})();

console.log("🐉 Creature catalog updated: 12 creatures ready.");
console.log("🌙 Diva is Mythic with a 2% catch chance.");

// ==========================================
// 🔒 MODERATION
// ==========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS jail_sentences (
    user_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    jailed_at TEXT NOT NULL,
    release_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_jail_release_at
  ON jail_sentences(release_at);
`);

// ==========================================
// 📊 PERFORMANCE INDEXES
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

  CREATE INDEX IF NOT EXISTS idx_badges_user
  ON user_badges(user_id);

  CREATE INDEX IF NOT EXISTS idx_challenges_week
  ON weekly_challenges(week_start);
`);

// ==========================================
// 🖤 CONNECTION CONFIRMATION
// ==========================================

console.log("🖤 HOOTIE DATABASE CONNECTED");
console.log("Database location: " + databasePath);
console.log("🪺 Wellness database ready");
console.log("🏅 Badges and challenges ready");
console.log("🦇 Arcade database ready");
console.log("🐉 Creature collection and spawn database ready");
console.log("🔒 Jail database ready");

module.exports = db;
