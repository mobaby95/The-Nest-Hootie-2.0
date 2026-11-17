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
];

module.exports = commands.map(command => command.toJSON());
