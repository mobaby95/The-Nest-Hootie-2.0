require("dotenv").config();

const db = require("./database");
const commands = require("./commands");

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  EmbedBuilder
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

// HOOTIE'S CUTE GOTHIC COLOR PALETTE
const COLORS = {
  burgundy: 0x702D46,
  crimson: 0xA34465,
  charcoal: 0x29232B,
  silver: 0xB9AEB6
};

// Create matching Hootie embeds
function createEmbed(title, description, color = COLORS.burgundy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "🦉 Hootie 2.0 • Where the night owls thrive."
    })
    .setTimestamp();
}

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

// Calculate previous calendar date
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

    // HAUNTED NEST WELCOME
    if (interaction.commandName === "nest") {
      const embed = createEmbed(
        "🏚️ WELCOME TO THE HAUNTED NEST",
        `Well, well... look who wandered into the woods. 👻\n\n` +
        `Welcome to **The Nest**, night owl!\n\n` +
        `🦇 Find your people.\n` +
        `🕯️ Take care of yourself.\n` +
        `🖤 Collect your rewards.\n` +
        `🌙 Make yourself at home.\n\n` +
        `Don't worry. The ghosts are friendly. Probably.`
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // HOOTIE STATUS
    if (interaction.commandName === "ping") {
      const embed = createEmbed(
        "👻 IS HOOTIE AWAKE?",
        `**BOO!** 🦉\n\n` +
        `Hootie is wide awake and watching over The Nest.\n\n` +
        `🖤 Systems: Operational\n` +
        `🌙 Database: Connected\n` +
        `🦇 Spooky levels: Maximum\n\n` +
        `All is quiet in the haunted woods... for now.`,
        COLORS.crimson
      );

      await interaction.reply({ embeds: [embed] });
      return;
    }

    // MIDNIGHT CONFESSIONS
    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response");
      const visibility = interaction.options.getString("visibility");
      const userId = interaction.user.id;

      const savedTimezone = db.prepare(`
        SELECT timezone
        FROM user_timezones
        WHERE user_id = ?
      `).get(userId);

      const timezone = savedTimezone
        ? savedTimezone.timezone
        : "America/Los_Angeles";

      const today = getLocalDate(timezone);
      const yesterday = getPreviousDate(today);

      const processCheckin = db.transaction(() => {

        db.prepare(`
          INSERT OR IGNORE INTO users (user_id)
          VALUES (?)
        `).run(userId);

        const existingReward = db.prepare(`
          SELECT id
          FROM wellness_checkins
          WHERE user_id = ?
            AND checkin_date = ?
            AND reward_earned = 1
        `).get(userId, today);

        const earnedReward = !existingReward;

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

          db.prepare(`
            UPDATE users
            SET
              wellness_points = wellness_points + 10,
              lifetime_points = lifetime_points + 10
            WHERE user_id = ?
          `).run(userId);

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

      let description =
        `A little birdie told me you stopped by. 🦉\n\n` +
        `**Your confession:**\n` +
        `> ${response.replace(/\n/g, "\n> ")}\n\n`;

      if (processCheckin.earnedReward) {
        description +=
          `🩸 **+10 Wellness Points!**\n` +
          `🔥 Streak: **${processCheckin.currentStreak} days**\n\n` +
          `Your daily reward has been tucked safely away in The Nest.`;
      } else {
        description +=
          `🖤 Your check-in has been saved!\n` +
          `You've already claimed today's reward.\n` +
          `🔥 Streak: **${processCheckin.currentStreak} days**`;
      }

      const embed = createEmbed(
        "🕯️ MIDNIGHT CONFESSIONS",
        description,
        COLORS.crimson
      );

      await interaction.reply({
        embeds: [embed],
        ephemeral: visibility === "private"
      });

      return;
    }

    // YOUR MIDNIGHT CLOCK
    if (interaction.commandName === "timezone") {
      const subcommand = interaction.options.getSubcommand();
      const userId = interaction.user.id;

      if (subcommand === "set") {
        const timezone = interaction.options.getString("zone");

        try {
          new Intl.DateTimeFormat("en-US", {
            timeZone: timezone
          });
        } catch (error) {
          const embed = createEmbed(
            "🌙 LOST IN THE TIME FOG",
            "That time zone doesn't look familiar. Please select one from Hootie's suggestions.",
            COLORS.crimson
          );

          await interaction.reply({
            embeds: [embed],
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

        const embed = createEmbed(
          "🕰️ YOUR MIDNIGHT CLOCK",
          `Your time zone has been tucked safely into Hootie's archives.\n\n` +
          `🌙 **Saved time zone:** ${timezone}\n\n` +
          `Your daily rewards and streaks will follow your local calendar.`,
          COLORS.crimson
        );

        await interaction.reply({
          embeds: [embed],
          ephemeral: true
        });

        return;
      }

      if (subcommand === "view") {
        const savedTimezone = db.prepare(`
          SELECT timezone
          FROM user_timezones
          WHERE user_id = ?
        `).get(userId);

        const timezone = savedTimezone
          ? savedTimezone.timezone
          : "America/Los_Angeles (default)";

        const embed = createEmbed(
          "🌙 YOUR MIDNIGHT CLOCK",
          `Hootie checked the archives!\n\n` +
          `🕰️ **Your current time zone:**\n${timezone}\n\n` +
          `Use \`/timezone set\` to change it whenever you like.`,
          COLORS.burgundy
        );

        await interaction.reply({
          embeds: [embed],
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
      const embed = createEmbed(
        "👻 A LITTLE SPOOKY GLITCH",
        "Hootie stumbled over a cobweb. Something went wrong while processing your command.\n\nPlease try again in a moment. 🖤",
        COLORS.crimson
      );

      await interaction.reply({
        embeds: [embed],
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
