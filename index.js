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

  } catch (error) {
    console.error("Command response error:", error);
  }
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log("🖤 HOOTIE 2.0 IS ONLINE");
  console.log("Logged in as " + readyClient.user.tag);
  console.log("Where the night owls thrive.");

  await registerCommands();
});

client.login(process.env.DISCORD_TOKEN);
