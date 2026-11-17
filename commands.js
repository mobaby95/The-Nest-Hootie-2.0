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
    )
];

module.exports = commands.map(command => command.toJSON());
