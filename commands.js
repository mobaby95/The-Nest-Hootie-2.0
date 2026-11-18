const { SlashCommandBuilder } = require("discord.js");

const commands = [

  // ==========================================
  // 🖤 THE NEST
  // ==========================================

  new SlashCommandBuilder()
    .setName("nest")
    .setDescription("Welcome to The Nest 🖤"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Hootie is awake 🦉"),

  // ==========================================
  // 🌙 WELLNESS COMMANDS
  // ==========================================

  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription("Share your daily wellness check-in 🪺")
    .addStringOption(option =>
      option.setName("response")
        .setDescription("How are you feeling today?")
        .setRequired(true)
        .setMaxLength(1000))
    .addStringOption(option =>
      option.setName("visibility")
        .setDescription("Choose who can see your check-in")
        .setRequired(true)
        .addChoices(
          { name: "Public", value: "public" },
          { name: "Private", value: "private" }
        )),

  new SlashCommandBuilder()
    .setName("water")
    .setDescription("Log your water intake 💧")
    .addNumberOption(option =>
      option.setName("cups")
        .setDescription("Amount of water in cups")
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("steps")
    .setDescription("Log your steps 👟")
    .addIntegerOption(option =>
      option.setName("count")
        .setDescription("Number of steps")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100000)),

  new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("Log your sleep 🌙")
    .addNumberOption(option =>
      option.setName("hours")
        .setDescription("Hours of sleep, e.g. 7.5")
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(24)),

  new SlashCommandBuilder()
    .setName("selfcare")
    .setDescription("Celebrate a little self-care 🕯️")
    .addStringOption(option =>
      option.setName("activity")
        .setDescription("What did you do for yourself?")
        .setRequired(true)
        .setMaxLength(200)),

  new SlashCommandBuilder()
    .setName("workout")
    .setDescription("Log a workout or movement session 🏋️")
    .addStringOption(option =>
      option.setName("activity")
        .setDescription("What kind of movement did you do?")
        .setRequired(true)
        .setMaxLength(100))
    .addIntegerOption(option =>
      option.setName("minutes")
        .setDescription("Duration in minutes")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(1440)),

  new SlashCommandBuilder()
    .setName("wellness")
    .setDescription("Open your personal Nest Archives 📖")
    .addUserOption(option =>
      option.setName("member")
        .setDescription("View another member's public achievements")
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See who is soaring in The Nest 🏆")
    .addStringOption(option =>
      option.setName("ranking")
        .setDescription("Choose the leaderboard")
        .setRequired(true)
        .addChoices(
          { name: "Weekly Wellness Points", value: "weekly" },
          { name: "Lifetime Owl XP", value: "lifetime" }
        )),

  new SlashCommandBuilder()
    .setName("challenges")
    .setDescription("View this week's Nest challenges 🏆"),

  new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Manage your personal time zone 🕒")
    .addSubcommand(subcommand =>
      subcommand.setName("set")
        .setDescription("Set your personal time zone")
        .addStringOption(option =>
          option.setName("zone")
            .setDescription("Search for your city or time zone")
            .setRequired(true)
            .setAutocomplete(true)))
    .addSubcommand(subcommand =>
      subcommand.setName("view")
        .setDescription("View your saved time zone")),

  // ==========================================
  // 🦇 THE NEST ARCADE
  // ==========================================

  new SlashCommandBuilder()
    .setName("arcade")
    .setDescription("Enter Hootie's spooky little arcade 🦇"),

  new SlashCommandBuilder()
    .setName("lastletter")
    .setDescription("Play Last Letter with the Nest 📝")
    .addStringOption(option =>
      option.setName("word")
        .setDescription("Enter a word to play")
        .setRequired(true)
        .setMaxLength(30)),

  new SlashCommandBuilder()
    .setName("madlibs")
    .setDescription("Create a ridiculous Nest Madlib 😂"),

  new SlashCommandBuilder()
    .setName("story")
    .setDescription("Continue the community's spooky story 📖")
    .addStringOption(option =>
      option.setName("contribution")
        .setDescription("Add the next part of the story")
        .setRequired(true)
        .setMaxLength(500)),

  new SlashCommandBuilder()
    .setName("arcadeleaderboard")
    .setDescription("See the top players in the Nest Arcade 🏆"),

  // ==========================================
  // 🐉 CREATURE COLLECTION & CATCHING
  // ==========================================

  new SlashCommandBuilder()
    .setName("catch")
    .setDescription("Try to catch a wild creature in The Nest! 🦇"),

  new SlashCommandBuilder()
    .setName("creatures")
    .setDescription("Explore your collectible creatures 🐉")

    .addSubcommand(subcommand =>
      subcommand.setName("collection")
        .setDescription("View your creature collection"))

    .addSubcommand(subcommand =>
      subcommand.setName("profile")
        .setDescription("View a creature's profile")
        .addStringOption(option =>
          option.setName("creature")
            .setDescription("Creature name")
            .setRequired(true)))

    .addSubcommand(subcommand =>
      subcommand.setName("setchannel")
        .setDescription("Choose the public creature spawn channel")
        .addChannelOption(option =>
          option.setName("channel")
            .setDescription("Channel for wild creature spawns")
            .setRequired(true)))

    .addSubcommand(subcommand =>
      subcommand.setName("start")
        .setDescription("Start automatic creature spawning"))

    .addSubcommand(subcommand =>
      subcommand.setName("stop")
        .setDescription("Stop automatic creature spawning"))

    .addSubcommand(subcommand =>
      subcommand.setName("spawn")
        .setDescription("Manually spawn a creature for testing")),

  // ==========================================
  // 🔒 NEST JAIL
  // ==========================================

  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Send a mischievous member to Nest Jail 🦇")
    .addUserOption(option =>
      option.setName("member")
        .setDescription("Member to jail")
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName("minutes")
        .setDescription("Duration of the sentence in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080))
    .addStringOption(option =>
      option.setName("reason")
        .setDescription("Reason for the sentence")
        .setRequired(false)
        .setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a member from Nest Jail 🔓")
    .addUserOption(option =>
      option.setName("member")
        .setDescription("Member to release")
        .setRequired(true))

];

module.exports = commands.map(command => command.toJSON());
