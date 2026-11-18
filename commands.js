const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("nest")
    .setDescription("Welcome to The Nest"),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check if Hootie is awake"),

  new SlashCommandBuilder()
    .setName("checkin")
    .setDescription("Complete your daily wellness check-in")
    .addStringOption(option =>
      option
        .setName("response")
        .setDescription("How are you feeling or checking in today?")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option
        .setName("visibility")
        .setDescription("Share publicly in the channel or keep private")
        .setRequired(true)
        .addChoices(
          { name: "Public", value: "public" },
          { name: "Private", value: "private" }
        )
    ),

  new SlashCommandBuilder()
    .setName("water")
    .setDescription("Log cups of water drank today")
    .addNumberOption(option =>
      option
        .setName("cups")
        .setDescription("Number of cups of water")
        .setRequired(true)
        .setMinValue(0.1)
        .setMaxValue(50)
    ),

  new SlashCommandBuilder()
    .setName("steps")
    .setDescription("Log your daily steps")
    .addIntegerOption(option =>
      option
        .setName("count")
        .setDescription("Number of steps")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(200000)
    ),

  new SlashCommandBuilder()
    .setName("sleep")
    .setDescription("Log your hours of sleep")
    .addNumberOption(option =>
      option
        .setName("hours")
        .setDescription("Hours slept")
        .setRequired(true)
        .setMinValue(0.5)
        .setMaxValue(24)
    ),

  new SlashCommandBuilder()
    .setName("selfcare")
    .setDescription("Log a self-care activity")
    .addStringOption(option =>
      option
        .setName("activity")
        .setDescription("What self-care ritual did you do?")
        .setRequired(true)
        .setMaxLength(200)
    ),

  new SlashCommandBuilder()
    .setName("workout")
    .setDescription("Log a workout or movement session")
    .addStringOption(option =>
      option
        .setName("activity")
        .setDescription("What movement or workout did you do?")
        .setRequired(true)
        .setMaxLength(200)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Duration in minutes (optional)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(600)
    ),

  new SlashCommandBuilder()
    .setName("wellness")
    .setDescription("View your Nest Archives dashboard or another member's public profile")
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Member whose public Nest profile you want to view")
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View The Nest leaderboards")
    .addStringOption(option =>
      option
        .setName("ranking")
        .setDescription("Choose which leaderboard to view")
        .setRequired(true)
        .addChoices(
          { name: "Weekly Wellness Points", value: "weekly" },
          { name: "Lifetime Owl XP", value: "lifetime" },
          { name: "Midnight Arcade Points", value: "arcade" }
        )
    ),

  new SlashCommandBuilder()
    .setName("challenges")
    .setDescription("View your weekly Nest challenges"),

  new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Manage your personal time zone")
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Set your time zone")
        .addStringOption(option =>
          option
            .setName("zone")
            .setDescription("Choose your IANA time zone")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View your currently saved time zone")
    ),

  new SlashCommandBuilder()
    .setName("arcade")
    .setDescription("Open the Midnight Arcade menu"),

  new SlashCommandBuilder()
    .setName("madlibs")
    .setDescription("Start a 15-prompt community Madlibs game in this channel"),

  new SlashCommandBuilder()
    .setName("lastletter")
    .setDescription("Manage a chat-based Last Letter word chain game")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Start a Last Letter word chain in this channel")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Stop the active Last Letter word chain in this channel")
    ),

  new SlashCommandBuilder()
    .setName("creatures")
    .setDescription("View your Hollow creature collection or manage spawns")
    .addSubcommand(subcommand =>
      subcommand
        .setName("collection")
        .setDescription("View the creatures you have caught")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("profile")
        .setDescription("Inspect a creature from the Hollow catalog")
        .addStringOption(option =>
          option
            .setName("creature")
            .setDescription("Creature name or ID")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("setchannel")
        .setDescription("Set the channel where wild creatures spawn")
        .addChannelOption(option =>
          option
            .setName("channel")
            .setDescription("Text channel for creature spawns")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("start")
        .setDescription("Enable automatic creature spawning")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("stop")
        .setDescription("Pause automatic creature spawning")
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("spawn")
        .setDescription("Manually spawn a wild creature now")
    ),

  new SlashCommandBuilder()
    .setName("catch")
    .setDescription("Try to catch an active wild creature in this channel"),

  new SlashCommandBuilder()
    .setName("arcadeleaderboard")
    .setDescription("View the Midnight Arcade high scores"),

  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Send a member to Nest Jail")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Member to jail")
        .setRequired(true)
    )
    .addIntegerOption(option =>
      option
        .setName("minutes")
        .setDescription("Duration in minutes")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(10080)
    )
    .addStringOption(option =>
      option
        .setName("reason")
        .setDescription("Reason for sending to Nest Jail")
        .setRequired(false)
        .setMaxLength(300)
    ),

  new SlashCommandBuilder()
    .setName("release")
    .setDescription("Release a member from Nest Jail early")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addUserOption(option =>
      option
        .setName("member")
        .setDescription("Member to release")
        .setRequired(true)
    )
].map(command => command.toJSON());

module.exports = commands;
