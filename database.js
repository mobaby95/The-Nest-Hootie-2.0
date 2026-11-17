const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const databasePath = process.env.DATABASE_PATH || "./data/hootie.sqlite";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Keep the existing tables and add the new wellness/challenge tables safely.
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

ensureColumn("users", "weekly_points", "INTEGER DEFAULT 0");
ensureColumn("users", "weekly_period", "TEXT");
ensureColumn("wellness_logs", "activity_date", "TEXT");
ensureColumn("wellness_logs", "points_awarded", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("wellness_checkins", "timezone_used", "TEXT");
ensureColumn("wellness_checkins", "reward_earned", "INTEGER NOT NULL DEFAULT 0");

// Backfill local-date-compatible activity dates for older records.
db.exec(`
  UPDATE wellness_logs
  SET activity_date = COALESCE(activity_date, substr(created_at, 1, 10))
  WHERE activity_date IS NULL;
`);

// Migrate older check-in tables that enforced one check-in per day.
const checkinsSchema = db.prepare(`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'wellness_checkins'
`).get();

if (
  checkinsSchema &&
  checkinsSchema.sql.replace(/\s+/g, "").toUpperCase()
    .includes("UNIQUE(USER_ID,CHECKIN_DATE)")
) {
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
    `);
    db.exec(`
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
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_daily_reward
  ON wellness_checkins(user_id, checkin_date)
  WHERE reward_earned = 1;

  CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_date
  ON wellness_logs(user_id, activity_date, activity_type);

  CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date
  ON wellness_checkins(user_id, checkin_date);
`);

console.log("🖤 HOOTIE DATABASE CONNECTED");
console.log("Database location: " + databasePath);

module.exports = db;
