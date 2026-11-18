require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActivityType
} = require("discord.js");
const db = require("./database");
const { commands } = require("./commands");
const { COLORS, TIMEZONES } = require("./src/config/constants");
const {
  makeEmbed,
  getLogoAttachment,
  localDate,
  weekStart
} = require("./src/utils/embeds");
const {
  ensureWeeklyChallenges,
  getStats,
  dashboardPayload,
  handleWellnessCommand
} = require("./src/features/wellness");
const {
  getActiveChannelGame,
  restoreActiveChannelGames,
  buildArcadeDashboardPayload,
  handleArcadeCommand,
  processMadlibsMessage,
  handleStoryPrefixCommand,
  processStoryMessage,
  processLastLetterMessage
} = require("./src/features/arcade");
const {
  trySpeedCatchInChat,
  restoreCreatureSpawns,
  handleCreatureCommand
} = require("./src/features/creatures");
const {
  checkJailSentences,
  handleJailCommand
} = require("./src/features/moderation");
const {
  buildLeaderboardPayload,
  buildHelpPayload
} = require("./src/features/leaderboards");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function registerCommands() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    console.warn("⚠️ Missing DISCORD_TOKEN or CLIENT_ID; skipping slash command registration.");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      await rest.put(Routes.applicationCommands(clientId), { body: [] });
      console.log(`✅ Registered ${commands.length} guild slash commands for ${guildId} (cleared legacy global commands)`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Registered ${commands.length} global slash commands`);
    }
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
}

client.once("ready", async () => {
  console.log(`🦉 Hootie 2.0 is awake as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{ name: "over The Nest 🖤", type: ActivityType.Watching }],
    status: "online"
  });

  ensureWeeklyChallenges(weekStart(localDate("America/Los_Angeles")));
  restoreActiveChannelGames();
  restoreCreatureSpawns(client);
  await checkJailSentences(client);

  setInterval(() => {
    checkJailSentences(client).catch(err => console.error("Jail check error:", err));
  }, 60 * 1000);
});

client.on("messageCreate", async message => {
  if (message.author.bot || !message.guild) return;

  try {
    const trimmed = message.content.trim();
    const lower = trimmed.toLowerCase();

    if (lower === "catch") {
      const caught = await trySpeedCatchInChat(message);
      if (caught) return;
    }

    if (lower === "!story start") {
      await handleStoryPrefixCommand(message, "start");
      return;
    }

    if (lower === "!story end") {
      await handleStoryPrefixCommand(message, "end");
      return;
    }

    const activeGame = getActiveChannelGame(message.guild.id, message.channel.id);
    if (!activeGame) return;

    if (activeGame.game_type === "madlibs") {
      await processMadlibsMessage(message);
    } else if (activeGame.game_type === "story") {
      await processStoryMessage(message);
    } else if (activeGame.game_type === "lastletter") {
      await processLastLetterMessage(message);
    }
  } catch (error) {
    console.error("Message handler error:", error);
  }
});

client.on("interactionCreate", async interaction => {
  try {
    // 1. Autocomplete
    if (interaction.isAutocomplete()) {
      const focused = interaction.options.getFocused(true);

      if (focused.name === "zone") {
        const query = focused.value.toLowerCase();
        const matches = TIMEZONES
          .filter(z => z.toLowerCase().includes(query))
          .slice(0, 25)
          .map(z => ({ name: z, value: z }));
        await interaction.respond(matches);
        return;
      }

      if (focused.name === "creature") {
        const query = focused.value.toLowerCase();
        const catalog = db.prepare(`SELECT creature_id, creature_name, rarity FROM creature_catalog ORDER BY creature_name`).all();
        const matches = catalog
          .filter(c => c.creature_name.toLowerCase().includes(query) || c.creature_id.toLowerCase().includes(query))
          .slice(0, 25)
          .map(c => ({ name: `${c.creature_name} (${c.rarity})`, value: c.creature_name }));
        await interaction.respond(matches);
      }
      return;
    }

    // 2. Buttons
    if (interaction.isButton()) {
      const parts = interaction.customId.split(":");

      if (parts[0] === "hootie") {
        const [, tab, targetUserId] = parts;
        const targetUser = await client.users.fetch(targetUserId).catch(() => interaction.user);
        const stats = getStats(targetUser.id);
        const payload = await dashboardPayload(targetUser, stats, tab);
        await interaction.update({ ...payload, attachments: [] });
        return;
      }

      if (parts[0] === "arcade") {
        const [, tab, targetUserId] = parts;
        const targetUser = await client.users.fetch(targetUserId).catch(() => interaction.user);
        const payload = await buildArcadeDashboardPayload(targetUser, tab);
        await interaction.update({ ...payload, attachments: [] });
        return;
      }

      if (parts[0] === "lb") {
        const ranking = parts[1] || "weekly";
        const payload = await buildLeaderboardPayload(ranking, client);
        await interaction.update({ ...payload, attachments: [] });
        return;
      }
    }

    // 3. Select Menus
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "help:category") {
        const category = interaction.values[0] || "wellness";
        await interaction.update(buildHelpPayload(category));
        return;
      }
    }

    // 4. Slash Commands
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    if (commandName === "wellness") {
      await handleWellnessCommand(interaction);
    } else if (commandName === "arcade") {
      await handleArcadeCommand(interaction);
    } else if (commandName === "creatures") {
      await handleCreatureCommand(interaction, client);
    } else if (commandName === "leaderboard") {
      const ranking = interaction.options.getString("ranking") || "weekly";
      await interaction.deferReply();
      const payload = await buildLeaderboardPayload(ranking, client);
      await interaction.editReply(payload);
    } else if (commandName === "jail") {
      await handleJailCommand(interaction, client);
    } else if (commandName === "nest") {
      const logo = getLogoAttachment();
      const embed = makeEmbed(
        "🖤 WELCOME TO THE NEST",
        "Hootie 2.0 watches over our cozy nocturnal sanctuary—tracking daily wellness rituals, hosting Midnight Arcade word games, and guarding the wild creatures of the Hollow.\n\n" +
        "Use `/help` to explore every command category!",
        COLORS.burgundy
      );
      if (logo) embed.setThumbnail("attachment://hootie-logo.jpg");

      await interaction.reply({
        embeds: [embed],
        ...(logo ? { files: [logo] } : {})
      });
    } else if (commandName === "help") {
      await interaction.reply(buildHelpPayload("wellness"));
    } else if (commandName === "ping") {
      const latency = Math.round(client.ws.ping);
      await interaction.reply({
        embeds: [makeEmbed("🦉 HOOT!", `Hootie 2.0 is awake and watching the rafters.\n**Gateway Latency:** ${latency}ms`, COLORS.charcoal)]
      });
    }
  } catch (error) {
    console.error("Interaction error:", error);
    const payload = { content: "⚠️ Something ruffled my feathers while running that command. Please try again!" };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

(async () => {
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
})();
