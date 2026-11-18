equire("dotenv").config();

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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN environment variable.");
if (!process.env.CLIENT_ID) throw new Error("Missing CLIENT_ID environment variable.");

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

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
  { id: "water_week", title: "The Moonwell", description: "Drink 56 cups of water this week.", type: "water", target: 56, reward: 25 },
  { id: "steps_week", title: "Wander the Hollow", description: "Walk 35,000 steps this week.", type: "steps", target: 35000, reward: 25 },
  { id: "sleep_week", title: "Dream Beneath the Stars", description: "Log 35 hours of sleep this week.", type: "sleep", target: 35, reward: 25 },
  { id: "selfcare_week", title: "A Little Ritual", description: "Complete 3 self-care activities this week.", type: "selfcare", target: 3, reward: 25 },
  { id: "checkin_week", title: "Five Nights, Five Wings", description: "Complete 5 daily check-ins this week.", type: "checkin", target: 5, reward: 25 },
  { id: "workout_week", title: "Strength of the Hollow", description: "Log 3 movement sessions this week.", type: "workout", target: 3, reward: 25 }
];

const TIMEZONES = [
  "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York",
  "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "Europe/London",
  "Europe/Paris", "Asia/Tokyo", "Australia/Sydney", "UTC"
];

function embed(title, description, color = COLORS.burgundy) {
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
  const d = new Date(`${dateString}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function weekStart(dateString) {
  const d = new Date(`${dateString}T12:00:00Z`);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - ((day + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function ensureUser(userId) {
  db.prepare(`INSERT OR IGNORE INTO users (user_id) VALUES (?)`).run(userId);
  db.prepare(`INSERT OR IGNORE INTO user_timezones (user_id) VALUES (?)`).run(userId);
  db.prepare(`INSERT OR IGNORE INTO arcade_points (user_id, points) VALUES (?, 0)`).run(userId);
}

function getTimezone(userId) {
  ensureUser(userId);
  return db.prepare(`SELECT timezone FROM user_timezones WHERE user_id = ?`).get(userId)?.timezone || "America/Los_Angeles";
}

function resetWeeklyPoints(userId, period) {
  ensureUser(userId);
  const row = db.prepare(`SELECT weekly_period FROM users WHERE user_id = ?`).get(userId);

  if (row.weekly_period !== period) {
    db.prepare(`UPDATE users SET weekly_points = 0, weekly_period = ? WHERE user_id = ?`).run(period, userId);
  }
}

function getLevel(points) {
  return [...LEVELS].reverse().find(level => points >= level.points) || LEVELS[0];
}

function nextLevel(points) {
  return LEVELS.find(level => level.points > points) || null;
}

function addWellnessPoints(userId, amount) {
  const period = weekStart(localDate(getTimezone(userId)));
  resetWeeklyPoints(userId, period);

  db.prepare(`
    UPDATE users
    SET weekly_points = weekly_points + ?,
        lifetime_points = lifetime_points + ?
    WHERE user_id = ?
  `).run(amount, amount, userId);
}

function addArcadePoints(userId, amount, reason) {
  ensureUser(userId);

  db.prepare(`UPDATE arcade_points SET points = points + ? WHERE user_id = ?`).run(amount, userId);
  db.prepare(`INSERT INTO arcade_transactions (user_id, points, reason) VALUES (?, ?, ?)`).run(userId, amount, reason);
}

function logGame(userId, gameName, score) {
  db.prepare(`INSERT INTO arcade_game_stats (user_id, game_name, score) VALUES (?, ?, ?)`).run(userId, gameName, score);
}

function awardBadges(userId) {
  const user = db.prepare(`SELECT lifetime_points FROM users WHERE user_id = ?`).get(userId);
  const streak = db.prepare(`SELECT current_streak FROM wellness_streaks WHERE user_id = ?`).get(userId)?.current_streak || 0;

  const checkins = db.prepare(`
    SELECT COUNT(*) AS n
    FROM wellness_checkins
    WHERE user_id = ? AND reward_earned = 1
  `).get(userId).n;

  const earned = new Set(
    db.prepare(`SELECT badge_id FROM user_badges WHERE user_id = ?`)
      .all(userId).map(x => x.badge_id)
  );

  const counts = Object.fromEntries(
    ["water", "steps", "sleep", "selfcare", "workout"].map(type => [
      type,
      db.prepare(`
        SELECT COUNT(DISTINCT activity_date) AS n
        FROM wellness_logs
        WHERE user_id = ? AND activity_type = ?
      `).get(userId, type).n
    ])
  );

  const conditions = {
    first_checkin: checkins >= 1,
    streak_7: streak >= 7,
    streak_30: streak >= 30,
    water_10: counts.water >= 10,
    steps_10: counts.steps >= 10,
    sleep_10: counts.sleep >= 10,
    selfcare_10: db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'selfcare'
    `).get(userId).n >= 10,
    workout_10: db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'workout'
    `).get(userId).n >= 10,
    challenge_1: db.prepare(`
      SELECT COUNT(*) AS n FROM user_challenge_completions
      WHERE user_id = ?
    `).get(userId).n >= 1,
    checkin_30: checkins >= 30
  };

  const fresh = [];

  for (const [id, name, description] of BADGES) {
    if (conditions[id] && !earned.has(id)) {
      db.prepare(`INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?, ?)`).run(userId, id);
      fresh.push({ id, name, description });
    }
  }

  return fresh;
}

function ensureWeeklyChallenges(period) {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO weekly_challenges
      (week_start, challenge_id, title, description, activity_type, target, reward_points)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of CHALLENGE_TEMPLATES) {
    insert.run(period, c.id, c.title, c.description, c.type, c.target, c.reward);
  }
}

function challengeProgress(userId, challenge, start) {
  if (challenge.activity_type === "checkin") {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_checkins
      WHERE user_id = ? AND checkin_date >= ? AND reward_earned = 1
    `).get(userId, start).n;
  }

  if (["selfcare", "workout"].includes(challenge.activity_type)) {
    return db.prepare(`
      SELECT COUNT(*) AS n FROM wellness_logs
      WHERE user_id = ? AND activity_type = ? AND activity_date >= ?
    `).get(userId, challenge.activity_type, start).n;
  }

  return db.prepare(`
    SELECT COALESCE(SUM(CAST(activity_value AS REAL)), 0) AS n
    FROM wellness_logs
    WHERE user_id = ? AND activity_type = ? AND activity_date >= ?
  `).get(userId, challenge.activity_type, start).n;
}

function evaluateChallenges(userId) {
  const start = weekStart(localDate(getTimezone(userId)));
  ensureWeeklyChallenges(start);

  const challenges = db.prepare(`
    SELECT * FROM weekly_challenges WHERE week_start = ?
  `).all(start);

  const completed = [];

  for (const c of challenges) {
    const progress = challengeProgress(userId, c, start);

    if (progress >= c.target) {
      const result = db.prepare(`
        INSERT OR IGNORE INTO user_challenge_completions
          (user_id, week_start, challenge_id)
        VALUES (?, ?, ?)
      `).run(userId, start, c.challenge_id);

      if (result.changes) {
        addWellnessPoints(userId, c.reward_points);
        completed.push(c.title);
      }
    }
  }

  return completed;
}

function recordActivity(userId, type, value) {
  const date = localDate(getTimezone(userId));

  if (type === "workout_minutes") {
    const info = db.prepare(`
      INSERT INTO wellness_logs
        (user_id, activity_type, activity_value, activity_date, points_awarded)
      VALUES (?, ?, ?, ?, 0)
    `).run(userId, type, String(value), date);

    return { points: 0, id: info.lastInsertRowid };
  }

  if (type === "water") {
    const awarded = db.prepare(`
      SELECT COALESCE(SUM(points_awarded), 0) AS total
      FROM wellness_logs
      WHERE user_id = ? AND activity_type = 'water' AND activity_date = ?
    `).get(userId, date).total || 0;

    const requested = Math.round(Number(value) * 2 * 100) / 100;
    const points = Math.max(0, Math.min(requested, 20 - awarded));

    const info = db.prepare(`
      INSERT INTO wellness_logs
        (user_id, activity_type, activity_value, activity_date, points_awarded)
      VALUES (?, 'water', ?, ?, ?)
    `).run(userId, String(value), date, points);

    if (points > 0) addWellnessPoints(userId, points);

    return { points, id: info.lastInsertRowid };
  }

  const already = db.prepare(`
    SELECT 1 FROM wellness_logs
    WHERE user_id = ? AND activity_type = ? AND activity_date = ?
    LIMIT 1
  `).get(userId, type, date);

  const points = already ? 0 : 5;

  const info = db.prepare(`
    INSERT INTO wellness_logs
      (user_id, activity_type, activity_value, activity_date, points_awarded)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, type, String(value), date, points);

  if (points) addWellnessPoints(userId, points);

  return { points, id: info.lastInsertRowid };
}

function progressBar(current, target, size = 12) {
  const filled = Math.max(0, Math.min(size, Math.floor((current / target) * size)));
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function rankAttachment(points) {
  const rank = getLevel(points);
  const filePath = path.join(__dirname, "assets", "ranks", rank.image);

  if (!fs.existsSync(filePath)) return { rank, file: null };

  return {
    rank,
    file: new AttachmentBuilder(filePath, { name: rank.image })
  };
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
    description += "\nYou have reached the highest rank.";
  }

  const e = embed(`${user.username}'s Nest Archives`, description, COLORS.burgundy);

  if (tab === "overview") {
    e.addFields(
      { name: "🔥 Current Streak", value: `${stats.current_streak || 0} days`, inline: true },
      { name: "🏆 Longest Streak", value: `${stats.longest_streak || 0} days`, inline: true },
      { name: "🪶 Rank", value: rank.name, inline: true }
    );
  } else if (tab === "activities") {
    const rows = db.prepare(`
      SELECT activity_type, COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ?
      GROUP BY activity_type
    `).all(user.id);

    e.setDescription(
      rows.length
        ? rows.map(r => `**${r.activity_type}** · ${r.n} logs`).join("\n")
        : "No activities logged yet. Your story is just beginning."
    );
  } else if (tab === "badges") {
    const rows = db.prepare(`
      SELECT badge_id FROM user_badges
      WHERE user_id = ?
      ORDER BY earned_at DESC
    `).all(user.id);

    const names = rows.map(r => BADGES.find(b => b[0] === r.badge_id)?.[1] || r.badge_id);

    e.setDescription(
      names.length
        ? names.map(n => `🏅 ${n}`).join("\n")
        : "No badges yet. Every little step counts."
    );
  } else if (tab === "challenges") {
    const start = weekStart(localDate(getTimezone(user.id)));
    ensureWeeklyChallenges(start);

    const rows = db.prepare(`
      SELECT * FROM weekly_challenges WHERE week_start = ?
    `).all(start);

    e.setDescription(rows.map(c => {
      const p = challengeProgress(user.id, c, start);
      return `${p >= c.target ? "✅" : "🌙"} **${c.title}**\n${progressBar(p, c.target)} ${Math.min(p, c.target)}/${c.target} · +${c.reward_points} points`;
    }).join("\n\n"));
  }

  return e;
}

function dashboardButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("hootie:overview").setLabel("Overview").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("hootie:activities").setLabel("Activities").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("hootie:badges").setLabel("Badges").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("hootie:challenges").setLabel("Challenges").setStyle(ButtonStyle.Secondary)
  );
}

function dashboardPayload(user, stats, tab = "overview") {
  const { rank, file } = rankAttachment(stats.lifetime_points || 0);
  const e = dashboardEmbed(user, stats, tab);

  if (file) e.setThumbnail(`attachment://${rank.image}`);

  return {
    embeds: [e],
    components: [dashboardButtons()],
    ...(file ? { files: [file] } : {})
  };
}
// ------------------------------------------
// ARCADE HELPERS
// ------------------------------------------

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function recordArcadeGame(userId, game, points, reason) {
  addArcadePoints(userId, points, reason);
  logGame(userId, game, points);
}

async function showArcade(interaction) {
  const e = embed(
    "🦇 The Midnight Arcade",
    "Choose a game and let the mischief begin.\n\n" +
    "**Word Games**\n" +
    "`/lastletter` — keep the word chain alive.\n" +
    "`/madlibs` — summon a ridiculous little story.\n" +
    "`/story` — add a line to the community tale.\n\n" +
    "**Collectibles**\n" +
    "`/creatures collection` — view your companions.\n" +
    "`/catch` — catch a wild creature when one appears.\n" +
    "`/creatures profile` — inspect a creature.\n\n" +
    "`/arcadeleaderboard` — see the arcade high scores.\n\n" +
    "Arcade Points are separate from Wellness Points and Owl XP.",
    COLORS.charcoal
  );

  await interaction.reply({ embeds: [e], ephemeral: false });
}

// ------------------------------------------
// WILD CREATURES + JAILBIRD SYSTEM
// ------------------------------------------

const spawnTimers = new Map();
const CREATURE_ASSET_DIR = path.join(__dirname, "assets", "creatures");

function creatureAttachment(creatureId) {
  const filePath = path.join(CREATURE_ASSET_DIR, `${creatureId}.png`);

  return fs.existsSync(filePath)
    ? new AttachmentBuilder(filePath, { name: `${creatureId}.png` })
    : null;
}

function clearSpawnTimer(guildId) {
  const timer = spawnTimers.get(guildId);

  if (timer) clearTimeout(timer);

  spawnTimers.delete(guildId);
}

function chooseCreature() {
  const all = db.prepare(`SELECT * FROM creature_catalog`).all();
  const roll = Math.random() * 100;

  const rarity =
    roll < 3 ? "Legendary" :
    roll < 8 ? "Ultra Rare" :
    roll < 20 ? "Rare" :
    roll < 45 ? "Uncommon" :
    "Common";

  const pool = all.filter(c => c.rarity === rarity);

  return randomItem(pool.length ? pool : all);
}

async function spawnCreature(guild, channelId) {
  const existing = db.prepare(`
    SELECT id FROM creature_spawns
    WHERE guild_id = ? AND active = 1
  `).get(guild.id);

  if (existing) return false;

  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel?.isTextBased()) return false;

  const creature = chooseCreature();
  const now = Date.now();
  const expires = new Date(now + 5 * 60 * 1000).toISOString();

  const info = db.prepare(`
    INSERT INTO creature_spawns
      (guild_id, channel_id, creature_id, spawned_at, expires_at, active)
    VALUES (?, ?, ?, ?, ?, 1)
  `).run(
    guild.id,
    channelId,
    creature.creature_id,
    new Date(now).toISOString(),
    expires
  );

  const art = creatureAttachment(creature.creature_id);

  const e = embed(
    "🌙 A WILD CREATURE HAS APPEARED!",
    `**${creature.creature_name}** · ${creature.rarity} ${creature.creature_type}\n\n` +
    `${creature.description}\n\n` +
    "Be the first to use **/catch**! This creature will vanish in **5 minutes**.",
    COLORS.crimson
  );

  if (art) e.setImage(`attachment://${art.name}`);

  await channel.send({
    embeds: [e],
    ...(art ? { files: [art] } : {})
  }).catch(error => console.error("Creature announcement failed:", error));

  return info.lastInsertRowid;
}

function scheduleNextSpawn(guildId, delayMs) {
  clearSpawnTimer(guildId);

  const delay = delayMs ??
    (20 * 60 * 1000 + Math.floor(Math.random() * 20 * 60 * 1000));

  const timer = setTimeout(async () => {
    try {
      const settings = db.prepare(`
        SELECT * FROM creature_game_settings
        WHERE guild_id = ? AND enabled = 1
      `).get(guildId);

      if (settings) {
        const active = db.prepare(`
          SELECT * FROM creature_spawns
          WHERE guild_id = ? AND active = 1
        `).get(guildId);

        if (active && new Date(active.expires_at).getTime() <= Date.now()) {
          db.prepare(`UPDATE creature_spawns SET active = 0 WHERE id = ?`).run(active.id);
        }

        const guild = await client.guilds.fetch(guildId).catch(() => null);

        if (guild) {
          await spawnCreature(guild, settings.channel_id);
        }

        scheduleNextSpawn(guildId);
      }
    } catch (error) {
      console.error("Creature spawn scheduler error:", error);
      scheduleNextSpawn(guildId);
    }
  }, delay);

  timer.unref?.();
  spawnTimers.set(guildId, timer);
}

async function handleCatch(interaction) {
  const spawn = db.prepare(`
    SELECT s.*, c.*
    FROM creature_spawns s
    JOIN creature_catalog c ON c.creature_id = s.creature_id
    WHERE s.guild_id = ? AND s.active = 1
    ORDER BY s.id DESC
    LIMIT 1
  `).get(interaction.guildId);

  if (!spawn || new Date(spawn.expires_at).getTime() <= Date.now()) {
    if (spawn) {
      db.prepare(`UPDATE creature_spawns SET active = 0 WHERE id = ?`).run(spawn.id);
    }

    await interaction.reply({
      content: "There isn't a wild creature to catch right now. Keep an eye on the Hollow!",
      ephemeral: true
    });

    return;
  }

  try {
    db.prepare(`
      INSERT INTO creature_spawn_attempts (spawn_id, user_id, success)
      VALUES (?, ?, 0)
    `).run(spawn.id, interaction.user.id);
  } catch {
    await interaction.reply({
      content: "You've already tried to catch this creature. Give another night owl a chance!",
      ephemeral: true
    });

    return;
  }

  const success = Math.random() < Number(spawn.catch_chance || 0.65);

  if (!success) {
    await interaction.reply({
      content: `**${spawn.creature_name}** slipped away! You can try again when another creature appears.`,
      ephemeral: true
    });

    return;
  }

  const won = db.prepare(`
    UPDATE creature_spawns
    SET active = 0, caught_by = ?, caught_at = ?
    WHERE id = ? AND active = 1
  `).run(interaction.user.id, new Date().toISOString(), spawn.id);

  if (!won.changes) {
    await interaction.reply({
      content: "Another night owl caught it first!",
      ephemeral: true
    });

    return;
  }

  db.prepare(`
    UPDATE creature_spawn_attempts
    SET success = 1
    WHERE spawn_id = ? AND user_id = ?
  `).run(spawn.id, interaction.user.id);

  const added = db.prepare(`
    INSERT OR IGNORE INTO user_creatures (user_id, creature_id)
    VALUES (?, ?)
  `).run(interaction.user.id, spawn.creature_id);

  recordArcadeGame(
    interaction.user.id,
    "creature_catch",
    10,
    `Caught ${spawn.creature_name}`
  );

  const art = creatureAttachment(spawn.creature_id);

  const e = embed(
    "🎉 THE CREATURE HAS BEEN CAUGHT!",
    `<@${interaction.user.id}> caught **${spawn.creature_name}**!\n\n` +
    `${spawn.rarity} ${spawn.creature_type}\n` +
    `+10 Arcade Points` +
    `${added.changes ? "\nAdded to your collection!" : "\nYou already own this companion — duplicate catch recorded!"}`,
    COLORS.crimson
  );

  if (art) e.setImage(`attachment://${art.name}`);

  await interaction.reply({
    embeds: [e],
    ...(art ? { files: [art] } : {})
  });
}

function jailRoleId() {
  return process.env.JAILBIRD_ROLE_ID?.trim();
}

async function releaseExpiredJailbirds() {
  const due = db.prepare(`
    SELECT * FROM jail_sentences
    WHERE release_at <= ?
  `).all(new Date().toISOString());

  for (const sentence of due) {
    const guild = await client.guilds.fetch(sentence.guild_id).catch(() => null);

    if (!guild) {
      db.prepare(`
        DELETE FROM jail_sentences
        WHERE user_id = ? AND guild_id = ?
      `).run(sentence.user_id, sentence.guild_id);

      continue;
    }

    const member = await guild.members.fetch(sentence.user_id).catch(() => null);

    if (!member) {
      db.prepare(`
        DELETE FROM jail_sentences
        WHERE user_id = ? AND guild_id = ?
      `).run(sentence.user_id, sentence.guild_id);

      continue;
    }

    const roleId = jailRoleId();

    if (!roleId) {
      console.error("JAILBIRD_ROLE_ID is not configured; automatic release is waiting.");
      continue;
    }

    try {
      if (member.roles.cache.has(roleId)) {
        await member.roles.remove(roleId, "Jailbird sentence completed");
      }

      db.prepare(`
        DELETE FROM jail_sentences
        WHERE user_id = ? AND guild_id = ?
      `).run(sentence.user_id, sentence.guild_id);

      await guild.systemChannel?.send(
        `🕊️ <@${sentence.user_id}> has been released from the Jailbird corner.`
      ).catch(() => {});
    } catch (error) {
      console.error("Automatic Jailbird release failed:", error);
    }
  }
}

async function jailMember(interaction) {
  if (!interaction.memberPermissions?.has("ManageRoles")) {
    await interaction.reply({
      content: "You need Manage Roles permission to use this command.",
      ephemeral: true
    });
    return;
  }

  const roleId = jailRoleId();

  if (!roleId) {
    await interaction.reply({
      content: "The Jailbird role ID is missing. Add `JAILBIRD_ROLE_ID` to Railway Variables first.",
      ephemeral: true
    });
    return;
  }

  const targetUser = interaction.options.getUser("member", true);
  const minutes = interaction.options.getInteger("minutes", true);
  const reason = interaction.options.getString("reason", true);
  const guild = interaction.guild;

  const target = await guild.members.fetch(targetUser.id).catch(() => null);
  const role = await guild.roles.fetch(roleId).catch(() => null);
  const botMember = await guild.members.fetchMe();

  if (!target || !role) {
    await interaction.reply({
      content: "I couldn't find the member or the configured Jailbird role.",
      ephemeral: true
    });
    return;
  }

  if (
    target.id === interaction.user.id ||
    target.id === client.user.id ||
    target.id === guild.ownerId
  ) {
    await interaction.reply({
      content: "That member cannot be jailed.",
      ephemeral: true
    });
    return;
  }

  if (
    role.position >= botMember.roles.highest.position ||
    target.roles.highest.position >= botMember.roles.highest.position
  ) {
    await interaction.reply({
      content: "Move Hootie's role above Jailbird and the target member's highest role, then try again.",
      ephemeral: true
    });
    return;
  }

  const releaseAt = new Date(Date.now() + minutes * 60000).toISOString();

  try {
    await target.roles.add(role, reason);

    db.prepare(`
      INSERT INTO jail_sentences
        (user_id, guild_id, moderator_id, reason, jailed_at, release_at)
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
      new Date().toISOString(),
      releaseAt
    );

    await interaction.reply({
      content:
        `🔒 <@${target.id}> has been sent to the Jailbird corner for **${minutes} minute(s)**.\n` +
        `Reason: ${reason}\n` +
        `Release: <t:${Math.floor(new Date(releaseAt).getTime() / 1000)}:R>`,
      ephemeral: false
    });
  } catch (error) {
    console.error("Jail command failed:", error);

    await interaction.reply({
      content: "I couldn't assign the Jailbird role. Check my role hierarchy and Manage Roles permission.",
      ephemeral: true
    });
  }
}

async function releaseJailbird(interaction) {
  if (!interaction.memberPermissions?.has("ManageRoles")) {
    await interaction.reply({
      content: "You need Manage Roles permission to use this command.",
      ephemeral: true
    });
    return;
  }

  const user = interaction.options.getUser("member", true);
  const roleId = jailRoleId();

  if (!roleId) {
    await interaction.reply({
      content: "The Jailbird role ID is missing from Railway Variables.",
      ephemeral: true
    });
    return;
  }

  const member = await interaction.guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    await interaction.reply({
      content: "I couldn't find that server member.",
      ephemeral: true
    });
    return;
  }

  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, `Released by ${interaction.user.tag}`);
    }

    db.prepare(`
      DELETE FROM jail_sentences
      WHERE user_id = ? AND guild_id = ?
    `).run(user.id, interaction.guildId);

    await interaction.reply({
      content: `🕊️ <@${user.id}> has been released from the Jailbird corner.`,
      ephemeral: false
    });
  } catch (error) {
    console.error("Release command failed:", error);

    await interaction.reply({
      content: "I couldn't remove the Jailbird role. Check my role hierarchy and permissions.",
      ephemeral: true
    });
  }
}
// ------------------------------------------
// DISCORD INTERACTIONS
// ------------------------------------------

client.on(Events.InteractionCreate, async interaction => {
  try {
    // TIME ZONE AUTOCOMPLETE
    if (interaction.isAutocomplete()) {
      if (
        interaction.commandName === "timezone" &&
        interaction.options.getSubcommand() === "set"
      ) {
        const q = interaction.options.getFocused().toLowerCase();

        await interaction.respond(
          TIMEZONES
            .filter(z => z.toLowerCase().includes(q))
            .slice(0, 25)
            .map(z => ({ name: z, value: z }))
        );
      }

      return;
    }

    // WELLNESS DASHBOARD BUTTONS
    if (interaction.isButton()) {
      if (interaction.customId.startsWith("hootie:")) {
        const tab = interaction.customId.split(":")[1];
        const stats = getStats(interaction.user.id);

        await interaction.update(
          dashboardPayload(interaction.user, stats, tab)
        );
      }

      return;
    }

    // MADLIBS MODAL SUBMISSION
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith("hootie:madlibs:")) {
        const ownerId = interaction.customId.split(":")[2];

        if (interaction.user.id !== ownerId) {
          await interaction.reply({
            content: "This Madlibs page belongs to another night owl. Start your own with `/madlibs`!",
            ephemeral: true
          });
          return;
        }

        const adjective = interaction.fields.getTextInputValue("adjective").trim();
        const noun = interaction.fields.getTextInputValue("noun").trim();
        const verb = interaction.fields.getTextInputValue("verb").trim();
        const place = interaction.fields.getTextInputValue("place").trim();

        const story =
          `Deep in the Hollow, a **${adjective} ${noun}** decided to ` +
          `**${verb}** beneath the moonlight at **${place}**.\n\n` +
          "The owls gasped. The bats applauded. Somewhere, a tiny ghost whispered, " +
          "“This is why we can't have normal evenings.”\n\n" +
          `And so, the legend of the ${adjective} ${noun} became part of Nest history.`;

        db.prepare(`
          INSERT INTO arcade_madlibs
            (guild_id, channel_id, user_id, story_text)
          VALUES (?, ?, ?, ?)
        `).run(
          interaction.guildId || "dm",
          interaction.channelId,
          interaction.user.id,
          story
        );

        recordArcadeGame(
          interaction.user.id,
          "madlibs",
          5,
          "Created a Madlib story"
        );

        await interaction.reply({
          embeds: [
            embed(
              "📖 A TALE FROM THE HOLLOW",
              `${story}\n\n+5 Arcade Points`,
              COLORS.charcoal
            )
          ]
        });

        return;
      }
    }

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;
    ensureUser(userId);

    // ------------------------------------------
    // NEST + PING
    // ------------------------------------------

    if (interaction.commandName === "nest") {
      await interaction.reply({
        embeds: [
          embed(
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
          embed(
            "🦉 Hootie is awake!",
            `Pong! ${client.ws.ping}ms`,
            COLORS.crimson
          )
        ],
        ephemeral: true
      });

      return;
    }

    // ------------------------------------------
    // DAILY CHECK-IN
    // ------------------------------------------

    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response", true);
      const visibility = interaction.options.getString("visibility", true);
      const timezone = getTimezone(userId);
      const today = localDate(timezone);

      const prior = db.prepare(`
        SELECT * FROM wellness_checkins
        WHERE user_id = ? AND checkin_date = ? AND reward_earned = 1
      `).get(userId, today);

      const streakRow = db.prepare(`
        SELECT * FROM wellness_streaks
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
          INSERT INTO wellness_checkins
            (user_id, response, visibility, checkin_date, timezone_used, reward_earned)
          VALUES (?, ?, ?, ?, ?, 1)
        `).run(userId, response, visibility, today, timezone);

        db.prepare(`
          INSERT INTO wellness_streaks
            (user_id, current_streak, longest_streak, last_checkin_date)
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
          INSERT INTO wellness_checkins
            (user_id, response, visibility, checkin_date, timezone_used, reward_earned)
          VALUES (?, ?, ?, ?, ?, 0)
        `).run(userId, response, visibility, today, timezone);
      }

      const badges = awardBadges(userId);
      const challenges = evaluateChallenges(userId);

      const msg = prior
        ? "Your check-in has been added. Today's daily reward was already collected."
        : "Your check-in has been recorded.";

      const e = embed(
        "🪺 NEST CHECK-IN",
        `${msg}\n\n` +
        `**Your reflection:** ${response}\n\n` +
        `${prior ? "" : "+10 Wellness Points"} · 🔥 ${streak} day streak\n` +
        `Visibility: **${visibility}**`,
        COLORS.burgundy
      );

      await interaction.reply({
        embeds: [e],
        ephemeral: visibility === "private"
      });

      if (badges.length || challenges.length) {
        const extra = [
          ...badges.map(b => `🏅 **New badge:** ${b.name}`),
          ...challenges.map(c => `🏆 **Challenge completed:** ${c}`)
        ].join("\n");

        await interaction.followUp({
          content: extra,
          ephemeral: true
        });
      }

      return;
    }

    // ------------------------------------------
    // WELLNESS ACTIVITY COMMANDS
    // ------------------------------------------

    const activityCommands = {
      water: {
        type: "water",
        option: "cups",
        label: "US cups of water",
        min: 0.1
      },
      steps: {
        type: "steps",
        option: "count",
        label: "steps",
        min: 1
      },
      sleep: {
        type: "sleep",
        option: "hours",
        label: "hours of sleep",
        min: 0.1
      },
      selfcare: {
        type: "selfcare",
        option: "activity",
        label: "self-care activity"
      },
      workout: {
        type: "workout",
        option: "activity",
        label: "movement session"
      }
    };

    if (activityCommands[interaction.commandName]) {
      const cfg = activityCommands[interaction.commandName];
      const value = interaction.options.get(cfg.option);
      const activityValue = value?.value;

      const activityResult = recordActivity(
        userId,
        cfg.type,
        activityValue
      );

      if (cfg.type === "workout") {
        const minutes = interaction.options.getInteger("minutes");

        if (minutes) {
          recordActivity(userId, "workout_minutes", minutes);
        }
      }

      const badges = awardBadges(userId);
      const challenges = evaluateChallenges(userId);

      const shown =
        typeof activityValue === "string"
          ? activityValue
          : `${activityValue} ${cfg.label}`;

      let message = cfg.type === "water"
        ? `Logged **${Number(activityValue).toLocaleString()} US cups** of water.\n` +
          `You earned **${activityResult.points} Wellness Points**` +
          `${activityResult.points === 0 ? " (your 20-point daily water cap has been reached)" : ""}.`
        : `Logged **${shown}**.\n` +
          `You earned **${activityResult.points} Wellness Points**` +
          `${activityResult.points === 0 ? ` (the daily ${cfg.type} reward was already collected)` : ""}.`;

      if (badges.length) {
        message += `\n🏅 New badge: ${badges.map(b => b.name).join(", ")}`;
      }

      if (challenges.length) {
        message += `\n🏆 Challenge completed: ${challenges.join(", ")}`;
      }

      await interaction.reply({
        embeds: [
          embed(
            "🌙 WELLNESS LOG UPDATED",
            message
          )
        ],
        ephemeral: false
      });

      return;
    }

    // ------------------------------------------
    // WELLNESS DASHBOARD + PUBLIC MEMBER PROFILE
    // ------------------------------------------

    if (interaction.commandName === "wellness") {
      const member =
        interaction.options.getUser("member") || interaction.user;

      const stats = getStats(member.id);

      if (member.id !== userId) {
        const rank = getLevel(stats.lifetime_points || 0);

        const badges = db.prepare(`
          SELECT badge_id FROM user_badges
          WHERE user_id = ?
          ORDER BY earned_at DESC
        `).all(member.id)
          .map(row => BADGES.find(b => b[0] === row.badge_id)?.[1] || row.badge_id);

        const publicProfile = embed(
          `🪶 ${member.username}'s Nest Profile`,
          `${rank.emoji} **${rank.name}**\n` +
          `Lifetime Owl XP: **${stats.lifetime_points || 0}**\n` +
          `Weekly Wellness Points: **${stats.weekly_points || 0}**\n` +
          `Current Streak: **${stats.current_streak || 0} days**\n` +
          `Longest Streak: **${stats.longest_streak || 0} days**\n\n` +
          `**Badges & Achievements**\n` +
          `${badges.length ? badges.map(name => `🏅 ${name}`).join("\n") : "No badges earned yet."}`,
          COLORS.burgundy
        );

        const art = rankAttachment(stats.lifetime_points || 0);

        if (art.file) {
          publicProfile.setThumbnail(`attachment://${rank.image}`);
        }

        await interaction.reply({
          embeds: [publicProfile],
          ...(art.file ? { files: [art.file] } : {}),
          ephemeral: false
        });

        return;
      }

      await interaction.reply({
        ...dashboardPayload(member, stats),
        ephemeral: true
      });

      return;
    }

    // ------------------------------------------
    // WELLNESS + ARCADE LEADERBOARDS
    // ------------------------------------------

    if (interaction.commandName === "leaderboard") {
      const ranking = interaction.options.getString("ranking", true);

      if (ranking === "arcade") {
        const arcadeRows = db.prepare(`
          SELECT user_id, points AS score
          FROM arcade_points
          ORDER BY score DESC
          LIMIT 10
        `).all();

        const arcadeLines = arcadeRows.length
          ? arcadeRows.map((r, i) =>
              `**${i + 1}.** <@${r.user_id}> — **${r.score} Arcade Points**`
            ).join("\n")
          : "No arcade scores yet. Start the fun!";

        await interaction.reply({
          embeds: [
            embed(
              "🦇 MIDNIGHT ARCADE LEADERBOARD",
              arcadeLines,
              COLORS.charcoal
            )
          ]
        });

        return;
      }

      const period =
        ranking === "weekly"
          ? "weekly_points"
          : "lifetime_points";

      const title =
        ranking === "weekly"
          ? "Weekly Wellness Points"
          : "Lifetime Owl XP";

      const rows = db.prepare(`
        SELECT user_id, ${period} AS score
        FROM users
        ORDER BY score DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) =>
            `**${i + 1}.** <@${r.user_id}> — **${r.score}**`
          ).join("\n")
        : "No scores yet. Be the first to soar!";

      await interaction.reply({
        embeds: [embed(`🏆 ${title}`, lines)],
        ephemeral: false
      });

      return;
    }

    // ------------------------------------------
    // WEEKLY CHALLENGES
    // ------------------------------------------

    if (interaction.commandName === "challenges") {
      const start = weekStart(localDate(getTimezone(userId)));

      ensureWeeklyChallenges(start);

      const rows = db.prepare(`
        SELECT * FROM weekly_challenges
        WHERE week_start = ?
      `).all(start);

      const lines = rows.map(c => {
        const p = challengeProgress(userId, c, start);

        return (
          `${p >= c.target ? "✅" : "🌙"} **${c.title}**\n` +
          `${c.description}\n` +
          `${progressBar(p, c.target)} ${Math.min(p, c.target)}/${c.target} · +${c.reward_points} points`
        );
      }).join("\n\n");

      await interaction.reply({
        embeds: [
          embed(
            "🏆 THIS WEEK IN THE NEST",
            lines
          )
        ],
        ephemeral: true
      });

      return;
    }

    // ------------------------------------------
    // TIME ZONE
    // ------------------------------------------

    if (interaction.commandName === "timezone") {
      const sub = interaction.options.getSubcommand();

      if (sub === "set") {
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
          INSERT INTO user_timezones (user_id, timezone, updated_at)
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

    // ------------------------------------------
    // ARCADE: ENTRY MENU
    // ------------------------------------------

    if (interaction.commandName === "arcade") {
      await showArcade(interaction);
      return;
    }

    // ------------------------------------------
    // ARCADE: LAST LETTER
    // ------------------------------------------

    if (interaction.commandName === "lastletter") {
      const raw = interaction.options.getString("word", true)
        .trim()
        .toLowerCase();

      const word = raw.replace(/[^a-z]/g, "");

      if (word.length < 2 || word !== raw) {
        await interaction.reply({
          content: "Use one word containing only English letters (at least two).",
          ephemeral: true
        });
        return;
      }

      const guildId = interaction.guildId || "dm";
      const channelId = interaction.channelId;

      const state = db.prepare(`
        SELECT * FROM arcade_lastletter_state
        WHERE guild_id = ? AND channel_id = ?
      `).get(guildId, channelId);

      const used = state
        ? JSON.parse(state.used_words || "[]")
        : [];

      if (used.includes(word)) {
        await interaction.reply({
          content: `**${word}** has already been used in this round.`,
          ephemeral: true
        });
        return;
      }

      if (state?.current_letter && word[0] !== state.current_letter) {
        await interaction.reply({
          content: `The next word must begin with **${state.current_letter.toUpperCase()}**.`,
          ephemeral: true
        });
        return;
      }

      if (state?.last_player_id === userId) {
        await interaction.reply({
          content: "Give another night owl a turn before playing again!",
          ephemeral: true
        });
        return;
      }

      used.push(word);

      const nextLetter = word[word.length - 1];

      db.prepare(`
        INSERT INTO arcade_lastletter_state
          (guild_id, channel_id, current_letter, last_player_id, used_words, round_count, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          current_letter = excluded.current_letter,
          last_player_id = excluded.last_player_id,
          used_words = excluded.used_words,
          round_count = arcade_lastletter_state.round_count + 1,
          updated_at = CURRENT_TIMESTAMP
      `).run(
        guildId,
        channelId,
        nextLetter,
        userId,
        JSON.stringify(used)
      );

      recordArcadeGame(
        userId,
        "lastletter",
        5,
        `Last Letter: ${word}`
      );

      await interaction.reply({
        embeds: [
          embed(
            "🔤 THE LAST LETTER",
            `**${interaction.user.username}** played **${word}**!\n\n` +
            `Next word starts with **${nextLetter.toUpperCase()}**.\n` +
            `+5 Arcade Points · ${used.length} words in this round.`,
            COLORS.charcoal
          )
        ]
      });

      return;
    }

    // ------------------------------------------
    // ARCADE: MADLIBS
    // ------------------------------------------

    if (interaction.commandName === "madlibs") {
      const modal = new ModalBuilder()
        .setCustomId(`hootie:madlibs:${userId}`)
        .setTitle("A Madlib from the Hollow");

      const fields = [
        ["adjective", "An adjective", "haunted", TextInputStyle.Short],
        ["noun", "A person, animal, or thing", "owl", TextInputStyle.Short],
        ["verb", "A verb", "moonwalk", TextInputStyle.Short],
        ["place", "A place", "the moonlit library", TextInputStyle.Short]
      ];

      for (const [id, label, placeholder, style] of fields) {
        const input = new TextInputBuilder()
          .setCustomId(id)
          .setLabel(label)
          .setStyle(style)
          .setPlaceholder(placeholder)
          .setRequired(true)
          .setMaxLength(60);

        modal.addComponents(
          new ActionRowBuilder().addComponents(input)
        );
      }

      await interaction.showModal(modal);
      return;
    }

    // ------------------------------------------
    // ARCADE: COMMUNITY STORY
    // ------------------------------------------

    if (interaction.commandName === "story") {
      const contribution = interaction.options
        .getString("contribution", true)
        .trim();

      if (!contribution || contribution.length > 350) {
        await interaction.reply({
          content: "Your story contribution must be between 1 and 350 characters.",
          ephemeral: true
        });
        return;
      }

      db.prepare(`
        INSERT INTO arcade_story_contributions
          (guild_id, channel_id, user_id, contribution)
        VALUES (?, ?, ?, ?)
      `).run(
        interaction.guildId || "dm",
        interaction.channelId,
        userId,
        contribution
      );

      recordArcadeGame(
        userId,
        "story",
        3,
        "Added to the community story"
      );

      const recent = db.prepare(`
        SELECT user_id, contribution
        FROM arcade_story_contributions
        WHERE guild_id = ? AND channel_id = ?
        ORDER BY id DESC
        LIMIT 5
      `).all(
        interaction.guildId || "dm",
        interaction.channelId
      ).reverse();

      const text = recent
        .map(r => `**<@${r.user_id}>:** ${r.contribution}`)
        .join("\n\n");

      await interaction.reply({
        embeds: [
          embed(
            "📜 THE NEST'S NEVERENDING STORY",
            `${text}\n\n+3 Arcade Points for adding to the tale.`,
            COLORS.charcoal
          )
        ]
      });

      return;
    }

    // ------------------------------------------
    // ARCADE: CREATURE COLLECTION
    // ------------------------------------------

    if (interaction.commandName === "creatures") {
      const sub = interaction.options.getSubcommand();

      if (sub === "collection") {
        const rows = db.prepare(`
          SELECT c.*, uc.discovered_at
          FROM user_creatures uc
          JOIN creature_catalog c ON c.creature_id = uc.creature_id
          WHERE uc.user_id = ?
          ORDER BY
            CASE c.rarity
              WHEN 'Legendary' THEN 1
              WHEN 'Ultra Rare' THEN 2
              WHEN 'Rare' THEN 3
              WHEN 'Uncommon' THEN 4
              ELSE 5
            END,
            c.creature_name
        `).all(userId);

        const all = db.prepare(`
          SELECT COUNT(*) AS n FROM creature_catalog
        `).get().n;

        const description = rows.length
          ? rows.map(c => `**${c.creature_name}** · ${c.rarity} ${c.creature_type}`).join("\n")
          : "Your collection is waiting for its first little visitor. Wait for a wild creature to appear, then use `/catch`.";

        await interaction.reply({
          embeds: [
            embed(
              `🐉 ${interaction.user.username}'s Hollow Companions`,
              `${description}\n\n**Collection:** ${rows.length}/${all}`,
              COLORS.charcoal
            )
          ],
          ephemeral: true
        });

        return;
      }

      // ADMIN CREATURE SETTINGS
      if (["setchannel", "start", "stop", "spawn"].includes(sub)) {
        if (!interaction.memberPermissions?.has("ManageGuild")) {
          await interaction.reply({
            content: "Only server managers can change creature-spawn settings.",
            ephemeral: true
          });
          return;
        }

        if (sub === "setchannel") {
          const channel = interaction.options.getChannel("channel", true);

          if (!channel.isTextBased()) {
            await interaction.reply({
              content: "Choose a text channel for creature spawns.",
              ephemeral: true
            });
            return;
          }

          db.prepare(`
            INSERT INTO creature_game_settings
              (guild_id, channel_id, enabled)
            VALUES (?, ?, 0)
            ON CONFLICT(guild_id) DO UPDATE SET
              channel_id = excluded.channel_id,
              updated_at = CURRENT_TIMESTAMP
          `).run(interaction.guildId, channel.id);

          await interaction.reply({
            content: `Wild creatures will appear in ${channel}. Use \`/creatures start\` when you're ready.`,
            ephemeral: true
          });

          return;
        }

        if (sub === "start") {
          const settings = db.prepare(`
            SELECT * FROM creature_game_settings
            WHERE guild_id = ?
          `).get(interaction.guildId);

          if (!settings?.channel_id) {
            await interaction.reply({
              content: "Set a spawn channel first with `/creatures setchannel`.",
              ephemeral: true
            });
            return;
          }

          db.prepare(`
            UPDATE creature_game_settings
            SET enabled = 1, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ?
          `).run(interaction.guildId);

          scheduleNextSpawn(interaction.guildId, 5000);

          await interaction.reply({
            content: "🌙 The Hollow is awake. Wild creature spawns are now active!",
            ephemeral: false
          });

          return;
        }

        if (sub === "stop") {
          db.prepare(`
            UPDATE creature_game_settings
            SET enabled = 0, updated_at = CURRENT_TIMESTAMP
            WHERE guild_id = ?
          `).run(interaction.guildId);

          clearSpawnTimer(interaction.guildId);

          db.prepare(`
            UPDATE creature_spawns
            SET active = 0
            WHERE guild_id = ? AND active = 1
          `).run(interaction.guildId);

          await interaction.reply({
            content: "The creature hunt has been paused.",
            ephemeral: false
          });

          return;
        }

        if (sub === "spawn") {
          const settings = db.prepare(`
            SELECT * FROM creature_game_settings
            WHERE guild_id = ?
          `).get(interaction.guildId);

          if (!settings?.channel_id) {
            await interaction.reply({
              content: "Set a spawn channel first with `/creatures setchannel`.",
              ephemeral: true
            });
            return;
          }

          const result = await spawnCreature(
            interaction.guild,
            settings.channel_id
          );

          await interaction.reply({
            content: result
              ? "A wild creature has appeared!"
              : "A creature is already roaming the Hollow.",
            ephemeral: true
          });

          return;
        }
      }

      // CREATURE PROFILE
      if (sub === "profile") {
        const name = interaction.options
          .getString("creature", true)
          .trim();

        const creature = db.prepare(`
          SELECT * FROM creature_catalog
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
          SELECT 1 FROM user_creatures
          WHERE user_id = ? AND creature_id = ?
        `).get(userId, creature.creature_id);

        const art = creatureAttachment(creature.creature_id);

        const profile = embed(
          `🐉 ${creature.creature_name}`,
          `**Type:** ${creature.creature_type}\n` +
          `**Rarity:** ${creature.rarity}\n` +
          `**Discovered:** ${owned ? "Yes — in your collection" : "Not yet"}\n\n` +
          `${creature.description}`,
          COLORS.charcoal
        );

        if (art) profile.setImage(`attachment://${art.name}`);

        await interaction.reply({
          embeds: [profile],
          ...(art ? { files: [art] } : {}),
          ephemeral: true
        });

        return;
      }
    }

    // ------------------------------------------
    // CATCH + JAIL + RELEASE
    // ------------------------------------------

    if (interaction.commandName === "catch") {
      await handleCatch(interaction);
      return;
    }

    if (interaction.commandName === "jail") {
      await jailMember(interaction);
      return;
    }

    if (interaction.commandName === "release") {
      await releaseJailbird(interaction);
      return;
    }

    // ------------------------------------------
    // ARCADE LEADERBOARD
    // ------------------------------------------

    if (interaction.commandName === "arcadeleaderboard") {
      const rows = db.prepare(`
        SELECT user_id, points
        FROM arcade_points
        ORDER BY points DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) =>
            `**${i + 1}.** <@${r.user_id}> — **${r.points} Arcade Points**`
          ).join("\n")
        : "No arcade scores yet. Start the fun!";

      await interaction.reply({
        embeds: [
          embed(
            "🦇 MIDNIGHT ARCADE LEADERBOARD",
            lines,
            COLORS.charcoal
          )
        ]
      });

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

// ------------------------------------------
// SLASH COMMAND REGISTRATION
// ------------------------------------------

async function registerCommands() {
  try {
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("🦉 Slash commands registered!");
  } catch (error) {
    console.error("Command registration failed:", error);
    throw error;
  }
}

// ------------------------------------------
// BOT STARTUP
// ------------------------------------------

client.once(Events.ClientReady, async readyClient => {
  console.log(`🖤 HOOTIE 2.0 IS ONLINE — ${readyClient.user.tag}`);

  try {
    for (const user of db.prepare(`SELECT user_id FROM users`).all()) {
      resetWeeklyPoints(
        user.user_id,
        weekStart(localDate(getTimezone(user.user_id)))
      );
    }

    await registerCommands();

    db.prepare(`
      UPDATE creature_spawns
      SET active = 0
      WHERE active = 1 AND expires_at <= ?
    `).run(new Date().toISOString());

    for (const setting of db.prepare(`
      SELECT guild_id FROM creature_game_settings
      WHERE enabled = 1
    `).all()) {
      const activeSpawn = db.prepare(`
        SELECT expires_at FROM creature_spawns
        WHERE guild_id = ? AND active = 1
      `).get(setting.guild_id);

      const delay = activeSpawn
        ? Math.max(
            1000,
            new Date(activeSpawn.expires_at).getTime() - Date.now() + 1000
          )
        : 15000;

      scheduleNextSpawn(setting.guild_id, delay);
    }

    setInterval(() => {
      releaseExpiredJailbirds().catch(error =>
        console.error("Jailbird timer error:", error)
      );
    }, 30000).unref?.();

    await releaseExpiredJailbirds();

  } catch (error) {
    console.error("Startup task failed:", error);
  }
});

// ------------------------------------------
// CLEAN UP JAIL SENTENCES WHEN MEMBERS LEAVE
// ------------------------------------------

client.on(Events.GuildMemberRemove, member => {
  db.prepare(`
    DELETE FROM jail_sentences
    WHERE user_id = ? AND guild_id = ?
  `).run(member.id, member.guild.id);
});

// ------------------------------------------
// LOGIN
// ------------------------------------------

client.login(process.env.DISCORD_TOKEN);
