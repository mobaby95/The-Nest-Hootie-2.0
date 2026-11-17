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
    .addStringOption(option =>
      option
        .setName("response")
        .setDescription("How are you feeling today? What's on your mind?")
        .setRequired(true)
        .setMaxLength(1000)
    )
    .addStringOption(option =>
      option
        .setName("visibility")
        .setDescription("Choose who can see your check-in")
        .setRequired(true)
        .addChoices(
          { name: "Public", value: "public" },
          { name: "Private", value: "private" }
        )
    ),

  new SlashCommandBuilder()
    .setName("timezone")
    .setDescription("Manage your personal time zone 🕒")
    .addSubcommand(subcommand =>
      subcommand
        .setName("set")
        .setDescription("Set your personal time zone")
        .addStringOption(option =>
          option
            .setName("zone")
            .setDescription("Search for your city or time zone")
            .setRequired(true)
            .setAutocomplete(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("view")
        .setDescription("View your saved time zone")
    )
];

module.exports = commands.map(command => command.toJSON());
