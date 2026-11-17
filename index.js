 GatewayIntentBits,
  Events
} = require("discord.js");

if (!process.env.DISCORD_TOKEN) {
  throw new Error("DISCORD_TOKEN is missing!");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});

client.once(Events.ClientReady, (readyClient) => {
  console.log("🖤 HOOTIE 2.0 IS ONLINE");
  console.log("Logged in as " + readyClient.user.tag);
  console.log("Where the night owls thrive.");
});

client.login(process.env.DISCORD_TOKEN);
