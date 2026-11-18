const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const databasePath = process.env.DATABASE_PATH || "./data/hootie.sqlite";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    wellness_points INTEGER DEFAULT 0,
    lifetime_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wellness_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    activity_value TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

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

  CREATE TABLE IF NOT EXISTS jail_sentences (
    user_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    jailed_at TEXT NOT NULL,
    release_at TEXT NOT NULL
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

function ensureColumn(table, column, definition) {
  const columns = db.pragma(`table_info(${table})`);
  if (!columns.some(item => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("users", "weekly_points", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "weekly_period", "TEXT");
ensureColumn("wellness_logs", "activity_date", "TEXT");
ensureColumn("wellness_logs", "points_awarded", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("wellness_checkins", "timezone_used", "TEXT");
ensureColumn("wellness_checkins", "reward_earned", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  UPDATE wellness_logs
  SET activity_date = COALESCE(activity_date, substr(created_at, 1, 10))
  WHERE activity_date IS NULL;

  CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_date
  ON wellness_logs(user_id, activity_date, activity_type);

  CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
  ON wellness_checkins(user_id, checkin_date);
`);

const checkinsSchema = db.prepare(`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'wellness_checkins'
`).get();

if (checkinsSchema && checkinsSchema.sql.replace(/\s+/g, "").toUpperCase().includes("UNIQUE(USER_ID,CHECKIN_DATE)")) {
  const oldColumns = db.pragma("table_info(wellness_checkins)").map(column => column.name);
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

      INSERT INTO wellness_checkins_new
        (id, user_id, response, visibility, checkin_date, timezone_used, reward_earned, created_at)
      SELECT
        id, user_id, response, visibility, checkin_date,
        ${hasTimezone ? "timezone_used" : "NULL"},
        ${hasReward ? "reward_earned" : "1"},
        created_at
      FROM wellness_checkins;

      DROP TABLE wellness_checkins;
      ALTER TABLE wellness_checkins_new RENAME TO wellness_checkins;
    `);
  })();

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
    ON wellness_checkins(user_id, checkin_date);
  `);
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_daily_reward
  ON wellness_checkins(user_id, checkin_date)
  WHERE reward_earned = 1;
`);

// Hootie 2.0 feature tables. All additions are non-destructive.
db.exec(`
  CREATE TABLE IF NOT EXISTS arcade_lastletter_state (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    current_letter TEXT,
    last_player_id TEXT,
    used_words TEXT NOT NULL DEFAULT '[]',
    round_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );

  CREATE TABLE IF NOT EXISTS arcade_madlibs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT,
    channel_id TEXT,
    user_id TEXT NOT NULL,
    story_text TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS arcade_story_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    contribution TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS creature_catalog (
    creature_id TEXT PRIMARY KEY,
    creature_name TEXT NOT NULL,
    creature_type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    description TEXT NOT NULL,
    catch_chance REAL NOT NULL DEFAULT 0.65,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_creatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    discovered_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, creature_id)
  );

  CREATE TABLE IF NOT EXISTS creature_game_settings (
    guild_id TEXT PRIMARY KEY,
    channel_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS creature_spawns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    spawned_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    caught_by TEXT,
    caught_at TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_creature_spawn
    ON creature_spawns(guild_id) WHERE active = 1;

  CREATE TABLE IF NOT EXISTS creature_spawn_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    spawn_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 0,
    attempted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(spawn_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_creature_spawn_expiry
    ON creature_spawns(active, expires_at);

  CREATE INDEX IF NOT EXISTS idx_jail_release_at
    ON jail_sentences(release_at);
`);

const creatures = [
  ["gloomlet", "Gloomlet", "Shadow", "Common", "A tiny shadow-dweller with curious eyes and a soft midnight glow.", 0.80],
  ["cindercrow", "Cindercrow", "Fire", "Common", "A soot-feathered crow with a warm ember tucked beneath one wing.", 0.80],
  ["moonmoth", "Moonmoth", "Moon", "Common", "A gentle moth whose wings shimmer like moonlit silk.", 0.80],
  ["thornkit", "Thornkit", "Nature", "Common", "A mischievous woodland kitten with tiny leafy thorns.", 0.80],
  ["duskwisp", "Duskwisp", "Spirit", "Uncommon", "A floating wisp that leaves a trail of violet sparks.", 0.65],
  ["hollowhare", "Hollowhare", "Shadow", "Uncommon", "A quiet hare that appears only where the forest grows dark.", 0.65],
  ["vesperwing", "Vesperwing", "Moon", "Uncommon", "A graceful night creature with silver-tipped wings.", 0.65],
  ["mycelune", "Mycelune", "Nature", "Uncommon", "A small forest guardian crowned with glowing mushrooms.", 0.65],
  ["belladusk", "Belladusk", "Shadow", "Rare", "A mysterious fox with dusk-colored fur and luminous markings.", 0.45],
  ["astralith", "Astralith", "Starlight", "Ultra Rare", "A celestial crystal dragon-deer said to carry fragments of the night sky.", 0.25],
  ["diva", "Diva", "Moon", "Legendary", "A beloved black-and-white Cockapoo with a moonlit aura and a heart of pure mischief.", 0.10],
  ["nocturne", "Nocturne", "Spirit", "Legendary", "An ancient spirit companion whose song echoes through the Hollow.", 0.10]
];

const seedCreature = db.prepare(`
  INSERT INTO creature_catalog
    (creature_id, creature_name, creature_type, rarity, description, catch_chance)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(creature_id) DO UPDATE SET
    creature_name=excluded.creature_name,
    creature_type=excluded.creature_type,
    rarity=excluded.rarity,
    description=excluded.description,
    catch_chance=excluded.catch_chance
`);

for (const creature of creatures) {
  seedCreature.run(...creature);
}

// One-time launch reset: points only. Preserve logs, streaks, badges, challenges,
// arcade history, creature collections, and all other records.
db.exec(`
  CREATE TABLE IF NOT EXISTS bot_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

const resetMigration = "hootie_launch_points_reset_2026_11";
const alreadyReset = db.prepare(
  "SELECT 1 FROM bot_migrations WHERE migration_id = ?"
).get(resetMigration);

if (!alreadyReset) {
  db.transaction(() => {
    db.prepare(`
      UPDATE users
      SET wellness_points=0, lifetime_points=0, weekly_points=0, level=0
    `).run();

    db.prepare("UPDATE arcade_points SET points=0").run();

    db.prepare(`
      INSERT INTO bot_migrations (migration_id) VALUES (?)
    `).run(resetMigration);
  })();

  console.log("🧹 One-time launch points reset applied (history and collections preserved).");
}

console.log("🖤 HOOTIE DATABASE CONNECTED");
console.log("Database location: " + databasePath);

module.exports = db;
