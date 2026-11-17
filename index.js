require("dotenv").config();

const db = require("./database");
const commands = require("./commands");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is missing!");
}

if (!process.env.CLIENT_ID) {
  throw new Error("CLIENT_ID is missing!");
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const rest = new REST({ version: "10" })
  .setToken(process.env.DISCORD_TOKEN);

// Searchable time-zone list
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

// Get a date in the member's local time zone
function getLocalDate(timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Calculate the previous calendar date
function getPreviousDate(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);

  const previousDate = new Date(
    Date.UTC(year, month - 1, day - 1)
  );

  return previousDate.toISOString().slice(0, 10);
}

// Register slash commands
async function registerCommands() {
  try {
    console.log("🦉 Registering Hootie's slash commands...");

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log("🖤 Hootie's slash commands registered!");
  } catch (error) {
    console.error("Command registration failed:", error);
  }
}

// Handle Discord interactions
client.on(Events.InteractionCreate, async (interaction) => {

  // TIME ZONE AUTOCOMPLETE
  if (interaction.isAutocomplete()) {
    if (
      interaction.commandName === "timezone" &&
      interaction.options.getSubcommand() === "set"
    ) {
      try {
        const focused = interaction.options
          .getFocused()
          .toLowerCase();

        const filtered = timezones
          .filter(([name, zone]) =>
            name.toLowerCase().includes(focused) ||
            zone.toLowerCase().includes(focused)
          )
          .slice(0, 25)
          .map(([name, zone]) => ({
            name: `${name} — ${zone}`,
            value: zone
          }));

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

    // WELCOME COMMAND
    if (interaction.commandName === "nest") {
      await interaction.reply({
        content: "🖤 Welcome to The Nest! Where the night owls thrive. 🦉"
      });

      return;
    }

    // PING COMMAND
    if (interaction.commandName === "ping") {
      await interaction.reply({
        content: "🦉 Hootie is awake! All systems are looking good. 🖤"
      });

      return;
    }

    // WELLNESS CHECK-IN
    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response");
      const visibility = interaction.options.getString("visibility");
      const userId = interaction.user.id;

      // Get the member's saved time zone
      const savedTimezone = db.prepare(`
        SELECT timezone
        FROM user_timezones
        WHERE user_id = ?
      `).get(userId);

      const timezone = savedTimezone
        ? savedTimezone.timezone
        : "America/Los_Angeles";

      // Determine the member's local date
      const today = getLocalDate(timezone);
      const yesterday = getPreviousDate(today);

      // Save the check-in and award points safely
      const processCheckin = db.transaction(() => {

        // Make sure the user has a wellness account
        db.prepare(`
          INSERT OR IGNORE INTO users (user_id)
          VALUES (?)
        `).run(userId);

        // Has this member already earned today's reward?
        const existingReward = db.prepare(`
          SELECT id
          FROM wellness_checkins
          WHERE user_id = ?
            AND checkin_date = ?
            AND reward_earned = 1
        `).get(userId, today);

        const earnedReward = !existingReward;

        // Save every check-in, even if no reward is earned
        db.prepare(`
          INSERT INTO wellness_checkins (
            user_id,
            response,
            visibility,
            checkin_date,
            timezone_used,
            reward_earned
          )
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          userId,
          response,
          visibility,
          today,
          timezone,
          earnedReward ? 1 : 0
        );

        // Get the member's current streak
        let streak = db.prepare(`
          SELECT current_streak, longest_streak, last_checkin_date
          FROM wellness_streaks
          WHERE user_id = ?
        `).get(userId);

        let currentStreak = streak
          ? streak.current_streak
          : 0;

        let longestStreak = streak
          ? streak.longest_streak
          : 0;

        // Only update points and streak on the first daily check-in
        if (earnedReward) {

          if (!streak || !streak.last_checkin_date) {
            currentStreak = 1;
          } else if (streak.last_checkin_date === today) {
            currentStreak = streak.current_streak;
          } else if (streak.last_checkin_date === yesterday) {
            currentStreak = streak.current_streak + 1;
          } else {
            currentStreak = 1;
          }

          longestStreak = Math.max(
            currentStreak,
            longestStreak
          );

          // Add 10 Wellness Points
          db.prepare(`
            UPDATE users
            SET
              wellness_points = wellness_points + 10,
              lifetime_points = lifetime_points + 10
            WHERE user_id = ?
          `).run(userId);

          // Save the updated streak
          db.prepare(`
            INSERT INTO wellness_streaks (
              user_id,
              current_streak,
              longest_streak,
              last_checkin_date
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id)
            DO UPDATE SET
              current_streak = excluded.current_streak,
              longest_streak = excluded.longest_streak,
              last_checkin_date = excluded.last_checkin_date
          `).run(
            userId,
            currentStreak,
            longestStreak,
            today
          );
        }

        return {
          earnedReward,
          currentStreak
        };
      }).immediate();

      // Build the Discord response
      let message =
        `🪺 **NEST CHECK-IN**\n\n` +
        `Thank you for checking in, ${interaction.user.username}! 🖤\n\n` +
        `**Your response:** ${response}\n\n`;

      if (processCheckin.earnedReward) {
        message +=
          `🌟 **+10 Wellness Points!**\n` +
          `🔥 Current streak: **${processCheckin.currentStreak} days**\n\n` +
          `Your daily reward has been added!`;
      } else {
        message +=
          `🖤 Your check-in has been saved!\n` +
          `You've already earned today's Wellness Points.\n` +
          `🔥 Current streak: **${processCheckin.currentStreak} days**`;
      }

      await interaction.reply({
        content: message,
        ephemeral: visibility === "private"
      });

      return;
    }

    // TIME ZONE COMMAND
    if (interaction.commandName === "timezone") {
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      // SET TIME ZONE
      if (subcommand === "set") {
        const timezone = interaction.options.getString("zone");

        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: timezone
          });
        } catch (error) {
          await interaction.reply({
            content: "❌ Invalid time zone. Please select a valid suggestion.",
            ephemeral: true
          });

          return;
        }

        db.prepare(`
          INSERT INTO user_timezones (user_id, timezone)
          VALUES (?, ?)
          ON CONFLICT(user_id)
          DO UPDATE SET
            timezone = excluded.timezone,
            updated_at = CURRENT_TIMESTAMP
        `).run(userId, timezone);

        await interaction.reply({
          content: `🕒 Your time zone has been saved as **${timezone}**! 🖤`,
          ephemeral: true
        });

        return;
      }

      // VIEW TIME ZONE
      if (subcommand === "view") {
        const savedTimezone = db.prepare(`
          SELECT timezone
          FROM user_timezones
          WHERE user_id = ?
        `).get(userId);

        const timezone = savedTimezone
          ? savedTimezone.timezone
          : "America/Los_Angeles (default)";

        await interaction.reply({
          content: `🕒 Your current time zone is **${timezone}**.`,
          ephemeral: true
        });

        return;
      }
    }

  } catch (error) {
    console.error("Command response error:", error);

    if (
      interaction.isRepliable() &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction.reply({
        content: "Something went wrong while Hootie was processing that command. 🖤",
        ephemeral: true
      }).catch(console.error);
    }
  }
});

// BOT READY
client.once(Events.ClientReady, async (readyClient) => {
  console.log("🖤 HOOTIE 2.0 IS ONLINE");
  console.log("Logged in as " + readyClient.user.tag);
  console.log("Where the night owls thrive.");

  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
