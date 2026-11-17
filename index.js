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
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "nest") {
      await interaction.reply({
        content: "🖤 Welcome to The Nest! Where the night owls thrive. 🦉"
      });
    }

    if (interaction.commandName === "ping") {
      await interaction.reply({
        content: "🦉 Hootie is awake! All systems are looking good. 🖤"
      });
    }

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
          await interaction.reply({
            content:
              "❌ Invalid time zone. Try `America/Los_Angeles` or `America/New_York`.",
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

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Something went wrong while Hootie was processing that command. 🖤",
        ephemeral: true
      }).catch(console.error);
    }
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log("🖤 HOOTIE 2.0 IS ONLINE");
  console.log("Logged in as " + readyClient.user.tag);
  console.log("Where the night owls thrive.");

  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
