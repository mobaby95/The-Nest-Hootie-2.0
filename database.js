const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const databasePath = process.env.DATABASE_PATH || "./data/hootie.sqlite";
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

function hasColumn(table, column) {
  return db.pragma(`table_info(${table})`).some(item => item.name === column);
}

function ensureColumn(table, column, definition) {
  if (!hasColumn(table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
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

const addedLifetimePoints = ensureColumn("users", "lifetime_points", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "weekly_points", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("users", "weekly_period", "TEXT");
ensureColumn("users", "level", "INTEGER NOT NULL DEFAULT 0");

if (addedLifetimePoints) {
  db.exec(`UPDATE users SET lifetime_points = COALESCE(wellness_points, 0)`);
}

ensureColumn("wellness_logs", "activity_date", "TEXT");
ensureColumn("wellness_logs", "points_awarded", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("wellness_checkins", "timezone_used", "TEXT");
ensureColumn("wellness_checkins", "reward_earned", "INTEGER NOT NULL DEFAULT 0");

db.exec(`
  UPDATE wellness_logs SET activity_date = substr(created_at, 1, 10) WHERE activity_date IS NULL;
  CREATE INDEX IF NOT EXISTS idx_wellness_logs_user_date ON wellness_logs(user_id, activity_date, activity_type);
  CREATE INDEX IF NOT EXISTS idx_wellness_checkins_user_date ON wellness_checkins(user_id, checkin_date);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_wellness_daily_reward ON wellness_checkins(user_id, checkin_date) WHERE reward_earned = 1;
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

  CREATE TABLE IF NOT EXISTS arcade_community_games (
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    state_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, channel_id)
  );
`);

// ==========================================
// 🐉 CREATURE COLLECTION (CAT BOT STYLE)
// ==========================================

db.exec(`
  CREATE TABLE IF NOT EXISTS creature_catalog (
    creature_id TEXT PRIMARY KEY,
    creature_name TEXT NOT NULL,
    creature_type TEXT NOT NULL,
    rarity TEXT NOT NULL,
    description TEXT NOT NULL,
    catch_chance REAL NOT NULL DEFAULT 1.0
  );

  CREATE TABLE IF NOT EXISTS user_creatures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    creature_id TEXT NOT NULL,
    nickname TEXT,
    count INTEGER NOT NULL DEFAULT 1,
    shiny_count INTEGER NOT NULL DEFAULT 0,
    fastest_catch_ms INTEGER,
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
    is_shiny INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    spawned_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    caught_by TEXT,
    caught_at TEXT,
    catch_time_ms INTEGER,
    message_id TEXT
  );

  CREATE TABLE IF NOT EXISTS creature_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    achievement_id TEXT NOT NULL,
    earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, achievement_id)
  );

  CREATE TABLE IF NOT EXISTS creature_daily_claims (
    user_id TEXT PRIMARY KEY,
    last_claim_date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS creature_gifts_sent (
    user_id TEXT PRIMARY KEY,
    gifts_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_equipped_companion (
    user_id TEXT PRIMARY KEY,
    creature_id TEXT NOT NULL,
    is_shiny INTEGER NOT NULL DEFAULT 0,
    equipped_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_items (
    user_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item_id)
  );

  CREATE TABLE IF NOT EXISTS user_active_buffs (
    user_id TEXT NOT NULL,
    buff_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    PRIMARY KEY (user_id, buff_id)
  );

  CREATE TABLE IF NOT EXISTS user_eggs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    egg_tier TEXT NOT NULL,
    steps_current INTEGER NOT NULL DEFAULT 0,
    steps_required INTEGER NOT NULL DEFAULT 50,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

ensureColumn("user_creatures", "count", "INTEGER NOT NULL DEFAULT 1");
ensureColumn("user_creatures", "shiny_count", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("user_creatures", "fastest_catch_ms", "INTEGER");
ensureColumn("creature_spawns", "catch_time_ms", "INTEGER");
ensureColumn("creature_spawns", "is_shiny", "INTEGER NOT NULL DEFAULT 0");

const creatures = [
  {
    id: "gloomlet",
    name: "Gloomlet",
    type: "Shadow",
    rarity: "Common",
    description: "A tiny shadow-dweller with curious eyes and a soft midnight glow."
  },
  {
    id: "cindercrow",
    name: "Cindercrow",
    type: "Fire",
    rarity: "Common",
    description: "A soot-feathered crow with a warm ember tucked beneath one wing."
  },
  {
    id: "moonmoth",
    name: "Moonmoth",
    type: "Moon",
    rarity: "Common",
    description: "A gentle moth whose wings shimmer like moonlit silk."
  },
  {
    id: "thornkit",
    name: "Thornkit",
    type: "Nature",
    rarity: "Common",
    description: "A mischievous woodland kitten with tiny leafy thorns."
  },
  {
    id: "duskwisp",
    name: "Duskwisp",
    type: "Spirit",
    rarity: "Uncommon",
    description: "A floating wisp that leaves a trail of violet sparks."
  },
  {
    id: "hollowhare",
    name: "Hollowhare",
    type: "Shadow",
    rarity: "Uncommon",
    description: "A quiet hare that appears only where the forest grows dark."
  },
  {
    id: "vesperwing",
    name: "Vesperwing",
    type: "Moon",
    rarity: "Uncommon",
    description: "A graceful night creature with silver-tipped wings."
  },
  {
    id: "mycelune",
    name: "Mycelune",
    type: "Nature",
    rarity: "Uncommon",
    description: "A small forest guardian crowned with glowing mushrooms."
  },
  {
    id: "belladusk",
    name: "Belladusk",
    type: "Shadow",
    rarity: "Rare",
    description: "A mysterious fox with dusk-colored fur and luminous markings."
  },
  {
    id: "astralith",
    name: "Astralith",
    type: "Starlight",
    rarity: "Ultra Rare",
    description: "A celestial crystal dragon-deer said to carry fragments of the night sky."
  },
  {
    id: "nocturne",
    name: "Nocturne",
    type: "Spirit",
    rarity: "Legendary",
    description: "An ancient spirit companion whose song echoes through the Hollow."
  },
  {
    id: "diva",
    name: "Diva",
    type: "Moon",
    rarity: "Mythic",
    description: "A beloved black-and-white havanese with a moonlit aura and a heart of pure mischief."
  },
  {
    id: "codee",
    name: "Codee",
    type: "Guardian",
    rarity: "Mythic",
    description: "A stout, heart-heavy Staffy guardian from the stony Midlands. Bold, fearless, and notoriously stubborn, he watches over the ancient Hollow libraries."
  },
  {
    id: "kiara",
    name: "Kiara",
    type: "Shadow",
    rarity: "Mythic",
    description: "Cloaked in brindle shadows, Kiara prowls the candlelit amethyst vaults beneath the Hollow, sniffing out ancient runes and hidden relics."
  },
  {
    id: "kion",
    name: "Kion",
    type: "Fire",
    rarity: "Mythic",
    description: "A golden-coated beacon in the Hollow's darkest marshes, Kion guides lost night owls along misty lakeside piers with warm lantern light."
  },
  {
    id: "pepper",
    name: "Pepper",
    type: "Moon",
    rarity: "Mythic",
    description: "Perched high atop the cathedral clocktower, silver-whiskered Pepper watches the stars turn—no nocturnal secret escapes her gaze."
  }
];

const upsertCreature = db.prepare(`
  INSERT INTO creature_catalog (creature_id, creature_name, creature_type, rarity, description, catch_chance)
  VALUES (@id, @name, @type, @rarity, @description, 1.0)
  ON CONFLICT(creature_id) DO UPDATE SET
    creature_name = excluded.creature_name,
    creature_type = excluded.creature_type,
    rarity = excluded.rarity,
    description = excluded.description,
    catch_chance = excluded.catch_chance
`);

const grantStarterDog = db.prepare(`
  INSERT OR IGNORE INTO user_creatures (user_id, creature_id, count, shiny_count, fastest_catch_ms)
  VALUES (?, ?, 1, 0, 1250)
`);

// Optional: Add Discord User IDs here to automatically grant Codee, Kiara, Kion, and Pepper on startup
const DOG_RECIPIENT_USER_IDS = [];

db.transaction(() => {
  for (const creature of creatures) {
    upsertCreature.run(creature);
  }

  for (const userId of DOG_RECIPIENT_USER_IDS) {
    for (const dogId of ["codee", "kiara", "kion", "pepper"]) {
      grantStarterDog.run(userId, dogId);
    }
  }
})();

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

  CREATE INDEX IF NOT EXISTS idx_jail_release_at ON jail_sentences(release_at);
  CREATE INDEX IF NOT EXISTS idx_user_creatures_user ON user_creatures(user_id);
  CREATE INDEX IF NOT EXISTS idx_creature_spawns_status ON creature_spawns(status, expires_at);
  CREATE INDEX IF NOT EXISTS idx_user_eggs_user ON user_eggs(user_id);
`);

console.log("🖤 HOOTIE DATABASE CONNECTED (Cat Bot Creature Edition)");

module.exports = db;
