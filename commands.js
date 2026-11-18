const { SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("nest")
    .setDescription("Welcome to The Nest 🖤"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Hootie is awake 🦉"),

  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription("Share your daily wellness check-in 🪺")
    .addStringOption(option => option.setName("response")
      .setDescription("How are you feeling today? What's on your mind?")
      .setRequired(true).setMaxLength(1000))
    .addStringOption(option => option.setName("visibility")
      .setDescription("Choose who can see your check-in")
      .setRequired(true)
      .addChoices(
        { name: "Public", value: "public" },
        { name: "Private", value: "private" }
      )),

  new SlashCommandBuilder()
    .setName("water")
    .setDescription("Log your water intake in US cups 💧")
    .addNumberOption(option => option.setName("cups")
      .setDescription("Number of US cups (decimals allowed)")
      .setRequired(true).setMinValue(0.1).setMaxValue(50)),

  new SlashCommandBuilder()
    .setName("steps")
    .setDescription("Log your steps 👟")
    .addIntegerOption(option => option.setName("count")
      .setDescription("Number of steps")
      .setRequired(true).setMinValue(1).setMaxValue(100000)),

  new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("Log your sleep 🌙")
    .addNumberOption(option => option.setName("hours")
      .setDescription("Hours of sleep, e.g. 7.5")
      .setRequired(true).setMinValue(0.1).setMaxValue(24)),

  new SlashCommandBuilder()
    .setName("selfcare")
    .setDescription("Celebrate a little self-care 🕯️")
    .addStringOption(option => option.setName("activity")
      .setDescription("What did you do for yourself?")
      .setRequired(true).setMaxLength(200)),

  new SlashCommandBuilder()
    .setName("workout")
    .setDescription("Log a workout or movement session 🏋️")
    .addStringOption(option => option.setName("activity")
      .setDescription("What kind of movement did you do?")
      .setRequired(true).setMaxLength(100))
    .addIntegerOption(option => option.setName("minutes")
      .setDescription("Optional duration in minutes")
      .setRequired(false).setMinValue(1).setMaxValue(1440)),

  new SlashCommandBuilder()
    .setName("wellness")
    .setDescription("Open your personal Nest Archives 📖")
    .addUserOption(option => option.setName("member")
      .setDescription("View another member's wellness profile")
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See who is soaring in The Nest 🏆")
    .addStringOption(option => option.setName("ranking")
      .setDescription("Choose the leaderboard")
      .setRequired(true)
      .addChoices(
        { name: "Weekly Wellness Points", value: "weekly" },
        { name: "Lifetime Owl XP", value: "lifetime" },
        { name: "Arcade Points", value: "arcade" }
      )),

  new SlashCommandBuilder()
    .setName("challenges")
    .setDescription("View this week's Nest challenges 🏆"),

  new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Manage your personal time zone 🕒")
    .addSubcommand(subcommand => subcommand.setName("set")
      .setDescription("Set your personal time zone")
      .addStringOption(option => option.setName("zone")
        .setDescription("Search for your city or time zone")
        .setRequired(true).setAutocomplete(true)))
    .addSubcommand(subcommand => subcommand.setName("view")
      .setDescription("View your saved time zone")),

  new SlashCommandBuilder()
    .setName("arcade")
    .setDescription("Visit the public Midnight Arcade 🦇"),

  new SlashCommandBuilder()
    .setName("lastletter")
    .setDescription("Play the public Last Letter word-chain game 🔤")
    .addStringOption(option => option.setName("word")
      .setDescription("Your word")
      .setRequired(true).setMaxLength(40)),

  new SlashCommandBuilder()
    .setName("madlibs")
    .setDescription("Generate a silly public story from the Hollow 📖"),

  new SlashCommandBuilder()
    .setName("story")
    .setDescription("Add a line to the community story 📜")
    .addStringOption(option => option.setName("contribution")
      .setDescription("Your next story sentence")
      .setRequired(true).setMaxLength(350)),

  new SlashCommandBuilder()
    .setName("arcadeleaderboard")
    .setDescription("See the public Midnight Arcade leaderboard 🏆"),

  new SlashCommandBuilder()
    .setName("catch")
    .setDescription("Try to catch the creature currently roaming the Hollow 🐾"),

  new SlashCommandBuilder()
    .setName("creatures")
    .setDescription("Manage or explore your Hollow companions 🐉")
    .addSubcommand(sub => sub.setName("collection")
      .setDescription("View your creature collection"))
    .addSubcommand(sub => sub.setName("profile")
      .setDescription("View a creature's profile")
      .addStringOption(option => option.setName("creature")
        .setDescription("Creature name or ID")
        .setRequired(true)))
    .addSubcommand(sub => sub.setName("setchannel")
      .setDescription("Set the public creature-spawn channel (admin)")
      .addChannelOption(option => option.setName("channel")
        .setDescription("Channel for creature spawns")
        .setRequired(true)))
    .addSubcommand(sub => sub.setName("start")
      .setDescription("Start automatic creature spawns (admin)"))
    .addSubcommand(sub => sub.setName("stop")
      .setDescription("Stop automatic creature spawns (admin)"))
    .addSubcommand(sub => sub.setName("spawn")
      .setDescription("Spawn a creature immediately (admin)")),

  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Temporarily send a member to the Nest's Jailbird corner")
    .addUserOption(option => option.setName("member")
      .setDescription("Member to jail")
      .setRequired(true))
    .addIntegerOption(option => option.setName("minutes")
      .setDescription("Sentence length in minutes (1–10080)")
      .setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(option => option.setName("reason")
      .setDescription("Reason for the sentence")
      .setRequired(true).setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a member from the Jailbird role")
    .addUserOption(option => option.setName("member")
      .setDescription("Member to release")
      .setRequired(true))
];

module.exports = commands.map(command => command.toJSON());
