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
  ButtonStyle
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
  intents: [GatewayIntentBits.Guilds]
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
  {
    name: "Midnight Hatchling",
    emoji: "🐣",
    points: 0,
    image: "midnight-hatchling.png"
  },
  {
    name: "Moonlit Familiar",
    emoji: "🌙",
    points: 100,
    image: "moonlit-familiar.png"
  },
  {
    name: "Velvet Night Owl",
    emoji: "🦉",
    points: 250,
    image: "velvet-night-owl.png"
  },
  {
    name: "Crimson Oracle",
    emoji: "🔮",
    points: 500,
    image: "crimson-oracle.png"
  },
  {
    name: "Shadow Guardian",
    emoji: "🖤",
    points: 1000,
    image: "shadow-guardian.png"
  },
  {
    name: "Elder of the Hollow",
    emoji: "👑",
    points: 2000,
    image: "elder-of-the-hollow.png"
  }
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
    description: "Drink 10,000 ml of water this week.",
    type: "water",
    target: 10000,
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
// 🌙 GENERAL HELPERS
// ==========================================

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
    INSERT OR IGNORE INTO users (user_id)
    VALUES (?)
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
  return [...LEVELS]
    .reverse()
    .find(level => points >= level.points) || LEVELS[0];
}

function nextLevel(points) {
  return LEVELS.find(level => level.points > points) || null;
}

// ==========================================
// 🪺 WELLNESS POINTS + 🦉 OWL XP
// ==========================================

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

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
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
      WHERE user_id = ?
        AND activity_type = 'selfcare'
    `).get(userId).n >= 10,

    workout_10: db.prepare(`
      SELECT COUNT(*) AS n
      FROM wellness_logs
      WHERE user_id = ?
        AND activity_type = 'workout'
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

  const already = db.prepare(`
    SELECT 1
    FROM wellness_logs
    WHERE user_id = ?
      AND activity_type = ?
      AND activity_date = ?
    LIMIT 1
  `).get(userId, type, date);

  const pointsAwarded = already ? 0 : 5;

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

  if (pointsAwarded) {
    addWellnessPoints(userId, pointsAwarded);
  }

  return pointsAwarded;
}

// ==========================================
// 📊 DASHBOARD HELPERS
// ==========================================

function progressBar(current, target, size = 12) {
  const filled = Math.max(
    0,
    Math.min(size, Math.floor((current / target) * size))
  );

  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

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

  const e = embed(
    `${user.username}'s Nest Archives`,
    description,
    COLORS.burgundy
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
        ? rows.map(row =>
            `**${row.activity_type}** · ${row.n} logs`
          ).join("\n")
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

// ==========================================
// 🦇 MIDNIGHT ARCADE MENU
// ==========================================

async function showArcade(interaction) {
  const e = embed(
    "🦇 The Midnight Arcade",
    "Choose a game and let the mischief begin.\n\n" +
    "**WORD GAMES**\n" +
    "`/lastletter` — Keep the word chain alive.\n" +
    "`/madlibs` — Summon a ridiculous little story.\n" +
    "`/story contribution` — Add a line to the community tale.\n\n" +
    "**COLLECTIBLES**\n" +
    "`/creatures collection` — View your companions.\n" +
    "`/creatures discover` — Search the Hollow for a creature.\n" +
    "`/creatures profile` — Inspect a creature.\n\n" +
    "`/arcadeleaderboard` — See the arcade high scores.\n\n" +
    "Arcade Points are separate from Wellness Points and Owl XP.",
    COLORS.charcoal
  );

  await interaction.reply({
    embeds: [e],
    ephemeral: true
  });
}

// ==========================================
// 🦉 DISCORD INTERACTIONS
// ==========================================

client.on(Events.InteractionCreate, async interaction => {
  try {

    // --------------------------------------
    // TIMEZONE AUTOCOMPLETE
    // --------------------------------------

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
            .map(zone => ({
              name: zone,
              value: zone
            }))
        );
      }

      return;
    }

    // --------------------------------------
    // DASHBOARD BUTTONS
    // --------------------------------------

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

    if (!interaction.isChatInputCommand()) return;

    const userId = interaction.user.id;

    ensureUser(userId);

    // --------------------------------------
    // NEST WELCOME
    // --------------------------------------

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

    // --------------------------------------
    // PING
    // --------------------------------------

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

    // --------------------------------------
    // DAILY WELLNESS CHECK-IN
    // --------------------------------------

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
        `).run(
          userId,
          response,
          visibility,
          today,
          timezone
        );

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
        `).run(
          userId,
          response,
          visibility,
          today,
          timezone
        );
      }

      const badges = awardBadges(userId);
      const challenges = evaluateChallenges(userId);

      const message = prior
        ? "Your check-in has been added. Today's daily reward was already collected."
        : "Your check-in has been recorded.";

      const e = embed(
        "🪺 NEST CHECK-IN",
        `${message}\n\n` +
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

    // --------------------------------------
    // WELLNESS ACTIVITY COMMANDS
    // --------------------------------------

    const activityCommands = {
      water: {
        type: "water",
        option: "amount",
        label: "ml of water"
      },
      steps: {
        type: "steps",
        option: "count",
        label: "steps"
      },
      sleep: {
        type: "sleep",
        option: "hours",
        label: "hours of sleep"
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

      const shown =
        typeof activityValue === "string"
          ? activityValue
          : `${activityValue} ${config.label}`;

      let message =
        `Logged **${shown}**.\n` +
        `You earned **${pointsAwarded} Wellness Points**.`;

      if (badges.length) {
        message +=
          `\n🏅 New badge: ${badges.map(badge => badge.name).join(", ")}`;
      }

      if (challenges.length) {
        message +=
          `\n🏆 Challenge completed: ${challenges.join(", ")}`;
      }

      await interaction.reply({
        embeds: [
          embed(
            "🌙 WELLNESS LOG UPDATED",
            message
          )
        ],
        ephemeral: true
      });

      return;
    }

    // --------------------------------------
    // PERSONAL WELLNESS DASHBOARD
    // --------------------------------------

    if (interaction.commandName === "wellness") {
      const member =
        interaction.options.getUser("member") || interaction.user;

      const stats = getStats(member.id);

      const latest = db.prepare(`
        SELECT visibility
        FROM wellness_checkins
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).get(member.id);

      if (
        member.id !== userId &&
        (!latest || latest.visibility !== "public")
      ) {
        await interaction.reply({
          content: "That member's Nest Archives are private.",
          ephemeral: true
        });

        return;
      }

      await interaction.reply({
        ...dashboardPayload(member, stats),
        ephemeral: true
      });

      return;
    }

    // --------------------------------------
    // WELLNESS LEADERBOARD
    // --------------------------------------

    if (interaction.commandName === "leaderboard") {
      const ranking = interaction.options.getString("ranking", true);

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
        ? rows.map((row, index) =>
            `**${index + 1}.** <@${row.user_id}> — **${row.score}**`
          ).join("\n")
        : "No scores yet. Be the first to soar!";

      await interaction.reply({
        embeds: [
          embed(
            `🏆 ${title}`,
            lines
          )
        ]
      });

      return;
    }

    // --------------------------------------
    // WEEKLY CHALLENGES
    // --------------------------------------

    if (interaction.commandName === "challenges") {
      const start = weekStart(localDate(getTimezone(userId)));

      ensureWeeklyChallenges(start);

      const rows = db.prepare(`
        SELECT *
        FROM weekly_challenges
        WHERE week_start = ?
      `).all(start);

      const lines = rows.map(challenge => {
        const progress = challengeProgress(
          userId,
          challenge,
          start
        );

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
          embed(
            "🏆 THIS WEEK IN THE NEST",
            lines
          )
        ],
        ephemeral: true
      });

      return;
    }

    // --------------------------------------
    // PERSONAL TIME ZONE
    // --------------------------------------

    if (interaction.commandName === "timezone") {
      const subcommand = interaction.options.getSubcommand();

      if (subcommand === "set") {
        const zone = interaction.options.getString("zone", true);

        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: zone
          });
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

    // --------------------------------------
    // ARCADE MENU
    // --------------------------------------

    if (interaction.commandName === "arcade") {
      await showArcade(interaction);
      return;
    }

    // --------------------------------------
    // LAST LETTER
    // --------------------------------------

    if (interaction.commandName === "lastletter") {
      const raw = interaction.options
        .getString("word", true)
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
        SELECT *
        FROM arcade_lastletter_state
        WHERE guild_id = ?
          AND channel_id = ?
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

      if (
        state?.current_letter &&
        word[0] !== state.current_letter
      ) {
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
        INSERT INTO arcade_lastletter_state (
          guild_id,
          channel_id,
          current_letter,
          last_player_id,
          used_words,
          round_count,
          updated_at
        )
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

    // --------------------------------------
    // MADLIBS
    // --------------------------------------

    if (interaction.commandName === "madlibs") {
      const pick = list => randomItem(list);

      const story =
        `At the edge of the Hollow, a ` +
        `${pick(["sparkly", "suspicious", "dramatic", "soggy", "haunted"])} ` +
        `${pick(["owl", "turnip", "ghost", "teapot", "skeleton"])} ` +
        `decided to ${pick(["dance", "scream", "moonwalk", "juggle", "hibernate"])} ` +
        `inside the ${pick(["library", "pumpkin patch", "castle", "laundromat", "moon"])}.\n\n` +

        `Suddenly, a ${pick(["tiny", "ancient", "cranky", "glittery", "invisible"])} ` +
        `${pick(["wizard", "raccoon", "vampire", "mushroom", "hamster"])} appeared, ` +
        `shouting, “${pick(["The snacks are cursed!", "Who stole my cape?", "Long live the moon!", "I regret everything!", "Bring me soup!"])}”\n\n` +

        `And that is how the legend of the ` +
        `${pick(["Midnight", "Crimson", "Unreasonably Moist", "Forgotten", "Very Confused"])} ` +
        `${pick(["Pancake", "Owl", "Sock", "Goblin", "Meatball"])} began.`;

      db.prepare(`
        INSERT INTO arcade_madlibs (
          guild_id,
          channel_id,
          user_id,
          story_text
        )
        VALUES (?, ?, ?, ?)
      `).run(
        interaction.guildId,
        interaction.channelId,
        userId,
        story
      );

      recordArcadeGame(
        userId,
        "madlibs",
        5,
        "Generated a Madlib"
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

    // --------------------------------------
    // COMMUNITY STORY
    // --------------------------------------

    if (interaction.commandName === "story") {
      const contribution =
        interaction.options.getSubcommand() === "contribution"
          ? interaction.options.getString("text", true).trim()
          : "";

      if (!contribution || contribution.length > 350) {
        await interaction.reply({
          content: "Your story contribution must be between 1 and 350 characters.",
          ephemeral: true
        });

        return;
      }

      db.prepare(`
        INSERT INTO arcade_story_contributions (
          guild_id,
          channel_id,
          user_id,
          contribution
        )
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
        WHERE guild_id = ?
          AND channel_id = ?
        ORDER BY id DESC
        LIMIT 5
      `).all(
        interaction.guildId || "dm",
        interaction.channelId
      ).reverse();

      const text = recent.map(row =>
        `**<@${row.user_id}>:** ${row.contribution}`
      ).join("\n\n");

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

    // --------------------------------------
    // CREATURE COLLECTION
    // --------------------------------------

    if (interaction.commandName === "creatures") {
      const subcommand = interaction.options.getSubcommand();

      // VIEW COLLECTION
      if (subcommand === "collection") {
        const rows = db.prepare(`
          SELECT c.*, uc.discovered_at
          FROM user_creatures uc
          JOIN creature_catalog c
            ON c.creature_id = uc.creature_id
          WHERE uc.user_id = ?
          ORDER BY
            CASE c.rarity
              WHEN 'Legendary' THEN 1
              WHEN 'Rare' THEN 2
              WHEN 'Uncommon' THEN 3
              ELSE 4
            END,
            c.creature_name
        `).all(userId);

        const all = db.prepare(`
          SELECT COUNT(*) AS n
          FROM creature_catalog
        `).get().n;

        const description = rows.length
          ? rows.map(creature =>
              `**${creature.creature_name}** · ${creature.rarity} ${creature.creature_type}`
            ).join("\n")
          : "Your collection is waiting for its first little visitor. Try `/creatures discover`.";

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

      // DISCOVER CREATURE
      if (subcommand === "discover") {
        const owned = new Set(
          db.prepare(`
            SELECT creature_id
            FROM user_creatures
            WHERE user_id = ?
          `).all(userId).map(row => row.creature_id)
        );

        const chances = [
          { rarity: "Common", weight: 60 },
          { rarity: "Uncommon", weight: 25 },
          { rarity: "Rare", weight: 12 },
          { rarity: "Legendary", weight: 3 }
        ];

        let roll = Math.random() * 100;
        let rarity = "Common";

        for (const entry of chances) {
          roll -= entry.weight;

          if (roll < 0) {
            rarity = entry.rarity;
            break;
          }
        }

        let pool = db.prepare(`
          SELECT *
          FROM creature_catalog
          WHERE rarity = ?
        `).all(rarity).filter(creature =>
          !owned.has(creature.creature_id)
        );

        if (!pool.length) {
          pool = db.prepare(`
            SELECT *
            FROM creature_catalog
          `).all().filter(creature =>
            !owned.has(creature.creature_id)
          );
        }

        if (!pool.length) {
          await interaction.reply({
            content: "✨ You've discovered every creature in the current Hollow collection!",
            ephemeral: true
          });

          return;
        }

        const creature = randomItem(pool);

        db.prepare(`
          INSERT OR IGNORE INTO user_creatures (
            user_id,
            creature_id
          )
          VALUES (?, ?)
        `).run(userId, creature.creature_id);

        recordArcadeGame(
          userId,
          "creature_discovery",
          10,
          `Discovered ${creature.creature_name}`
        );

        await interaction.reply({
          embeds: [
            embed(
              "✨ A CREATURE HAS FOUND YOU",
              `**${creature.creature_name}**\n` +
              `*${creature.rarity} ${creature.creature_type}*\n\n` +
              `${creature.description}\n\n` +
              `+10 Arcade Points\n` +
              `Added to your collection!`,
              COLORS.crimson
            )
          ]
        });

        return;
      }

      // CREATURE PROFILE
      if (subcommand === "profile") {
        const name = interaction.options
          .getString("creature", true)
          .trim();

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

        await interaction.reply({
          embeds: [
            embed(
              `🐉 ${creature.creature_name}`,
              `**Type:** ${creature.creature_type}\n` +
              `**Rarity:** ${creature.rarity}\n` +
              `**Discovered:** ${owned ? "Yes — in your collection" : "Not yet"}\n\n` +
              `${creature.description}`,
              COLORS.charcoal
            )
          ],
          ephemeral: true
        });

        return;
      }
    }

    // --------------------------------------
    // ARCADE LEADERBOARD
    // --------------------------------------

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

// ==========================================
// 🦉 REGISTER SLASH COMMANDS
// ==========================================

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

// ==========================================
// 🖤 HOOTIE STARTUP
// ==========================================

client.once(Events.ClientReady, async readyClient => {
  console.log(
    `🖤 HOOTIE 2.0 IS ONLINE — ${readyClient.user.tag}`
  );

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

    await registerCommands();

  } catch (error) {
    console.error("Startup task failed:", error);
  }
});

client.login(process.env.DISCORD_TOKEN);
