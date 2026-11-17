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

        if (!interaction.responded) {
          await interaction.respond([]).catch(console.error);
        }
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
    }

    // PING COMMAND
    if (interaction.commandName === "ping") {
      await interaction.reply({
        content: "🦉 Hootie is awake! All systems are looking good. 🖤"
      });
    }

    // WELLNESS CHECK-IN
    if (interaction.commandName === "checkin") {
      const response = interaction.options.getString("response");
      const visibility = interaction.options.getString("visibility");

      await interaction.reply({
        content:
          `🪺 **NEST CHECK-IN**\n\n` +
          `Thank you for checking in, ${interaction.user.username}! 🖤\n\n` +
          `**Your response:** ${response}\n\n` +
          `Your check-in has been received!`,
        ephemeral: visibility === "private"
      });
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
