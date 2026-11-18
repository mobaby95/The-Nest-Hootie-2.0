const { SlashCommandBuilder } = require("discord.js");

const commands = [

  // THE NEST
  new SlashCommandBuilder()
    .setName("nest")
    .setDescription("Welcome to The Nest 🖤"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Hootie is awake 🦉"),

  // WELLNESS
  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription("Share your daily wellness check-in 🪺")
    .addStringOption(o => o.setName("response").setDescription("How are you feeling today?").setRequired(true).setMaxLength(1000))
    .addStringOption(o => o.setName("visibility").setDescription("Choose who can see your check-in").setRequired(true)
      .addChoices(
        { name: "Public", value: "public" },
        { name: "Private", value: "private" }
      )),

  new SlashCommandBuilder()
    .setName("water")
    .setDescription("Log your water intake 💧")
    .addNumberOption(o => o.setName("cups").setDescription("Amount of water in US cups").setRequired(true).setMinValue(0.1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("steps")
    .setDescription("Log your daily steps 👟")
    .addIntegerOption(o => o.setName("count").setDescription("Number of steps").setRequired(true).setMinValue(1).setMaxValue(100000)),

  new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("Log your sleep 🌙")
    .addNumberOption(o => o.setName("hours").setDescription("Hours of sleep").setRequired(true).setMinValue(0.1).setMaxValue(24)),

  new SlashCommandBuilder()
    .setName("selfcare")
    .setDescription("Celebrate a little self-care 🕯️")
    .addStringOption(o => o.setName("activity").setDescription("What did you do for yourself?").setRequired(true).setMaxLength(200)),

  new SlashCommandBuilder()
    .setName("workout")
    .setDescription("Log a workout or movement session 🏋️")
    .addStringOption(o => o.setName("activity").setDescription("What kind of movement did you do?").setRequired(true).setMaxLength(100))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration in minutes").setRequired(false).setMinValue(1).setMaxValue(1440)),

  new SlashCommandBuilder()
    .setName("wellness")
    .setDescription("Open your personal Nest Archives 📖")
    .addUserOption(o => o.setName("member").setDescription("View another member's public achievements").setRequired(false)),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See who is soaring in The Nest 🏆")
    .addStringOption(o => o.setName("ranking").setDescription("Choose the leaderboard").setRequired(true)
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
    .addSubcommand(s => s.setName("set").setDescription("Set your personal time zone")
      .addStringOption(o => o.setName("zone").setDescription("Search for your city or time zone").setRequired(true).setAutocomplete(true)))
    .addSubcommand(s => s.setName("view").setDescription("View your saved time zone")),

  // THE NEST ARCADE
  new SlashCommandBuilder()
    .setName("arcade")
    .setDescription("Enter Hootie's spooky little arcade 🦇"),

  new SlashCommandBuilder()
    .setName("lastletter")
    .setDescription("Start or stop Last Letter in this channel 📝")
    .addSubcommand(s => s.setName("start").setDescription("Start a new Last Letter game"))
    .addSubcommand(s => s.setName("stop").setDescription("Stop the Last Letter game")),

  new SlashCommandBuilder()
    .setName("madlibs")
    .setDescription("Start a community Nest Madlib 😂"),

  new SlashCommandBuilder()
    .setName("arcadeleaderboard")
    .setDescription("See the top players in the Nest Arcade 🏆"),

  // WILD CREATURES
  new SlashCommandBuilder()
    .setName("catch")
    .setDescription("Try to catch a wild creature in The Nest! 🦇"),

  new SlashCommandBuilder()
    .setName("creatures")
    .setDescription("Explore your collectible creatures 🐉")
    .addSubcommand(s => s.setName("collection").setDescription("View your creature collection"))
    .addSubcommand(s => s.setName("profile").setDescription("View a creature's profile")
      .addStringOption(o => o.setName("creature").setDescription("Name of the creature").setRequired(true)))
    .addSubcommand(s => s.setName("setchannel").setDescription("Choose the public creature spawn channel")
      .addChannelOption(o => o.setName("channel").setDescription("Channel for wild creature spawns").setRequired(true)))
    .addSubcommand(s => s.setName("start").setDescription("Start automatic creature spawning"))
    .addSubcommand(s => s.setName("stop").setDescription("Stop automatic creature spawning"))
    .addSubcommand(s => s.setName("spawn").setDescription("Manually spawn a creature for testing")),

  // NEST JAIL
  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Send a mischievous member to Nest Jail 🦇")
    .addUserOption(o => o.setName("member").setDescription("Member to jail").setRequired(true))
    .addIntegerOption(o => o.setName("minutes").setDescription("Duration of the sentence in minutes").setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the sentence").setRequired(false).setMaxLength(300)),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a member from Nest Jail 🔓")
    .addUserOption(o => o.setName("member").setDescription("Member to release").setRequired(true))

];

module.exports = commands.map(command => command.toJSON());
