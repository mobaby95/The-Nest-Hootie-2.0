const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");

const visibilityOption = option =>
  option
    .setName("visibility")
    .setDescription("Choose whether this log posts publicly in chat or privately to you")
    .addChoices(
      { name: "Public (post in chat)", value: "public" },
      { name: "Private (only visible to you)", value: "private" }
    );

const commands = [
  // 1. WELLNESS
  new SlashCommandBuilder()
    .setName("wellness")
    .setDescription("Daily check-ins, wellness logs, private dashboard, and weekly challenges")
    .addSubcommand(sub =>
      sub
        .setName("dashboard")
        .setDescription("Open your private Nest Archives dashboard")
        .addUserOption(opt => opt.setName("member").setDescription("Member to inspect"))
    )
    .addSubcommand(sub =>
      sub
        .setName("checkin")
        .setDescription("Record your daily Nest reflection (+10 Wellness Points)")
        .addStringOption(opt =>
          opt.setName("response").setDescription("How are you arriving tonight?").setRequired(true)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("water")
        .setDescription("Log cups of water drank today (+2 pts/cup, up to 20 pts/day)")
        .addNumberOption(opt =>
          opt.setName("cups").setDescription("Number of cups").setMinValue(0.25).setMaxValue(50).setRequired(true)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("steps")
        .setDescription("Log your daily step count (+5 Wellness Points)")
        .addIntegerOption(opt =>
          opt.setName("count").setDescription("Total steps").setMinValue(1).setMaxValue(200000).setRequired(true)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("sleep")
        .setDescription("Log hours of sleep (+5 Wellness Points)")
        .addNumberOption(opt =>
          opt.setName("hours").setDescription("Hours slept").setMinValue(0.5).setMaxValue(24).setRequired(true)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("selfcare")
        .setDescription("Log a self-care ritual (+5 Wellness Points)")
        .addStringOption(opt =>
          opt.setName("activity").setDescription("What did you do for yourself?").setRequired(true)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("workout")
        .setDescription("Log a movement or workout session (+5 Wellness Points)")
        .addStringOption(opt =>
          opt.setName("activity").setDescription("Type of movement or workout").setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName("minutes").setDescription("Duration in minutes").setMinValue(1).setMaxValue(600)
        )
        .addStringOption(visibilityOption)
    )
    .addSubcommand(sub =>
      sub
        .setName("challenges")
        .setDescription("View your weekly Nest wellness challenges")
    )
    .addSubcommand(sub =>
      sub
        .setName("timezone-set")
        .setDescription("Set your local time zone for daily resets")
        .addStringOption(opt =>
          opt.setName("zone").setDescription("IANA time zone (e.g., America/Los_Angeles)").setAutocomplete(true).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("timezone-view")
        .setDescription("View your saved Nest time zone")
    ),

  // 2. MIDNIGHT ARCADE
  new SlashCommandBuilder()
    .setName("arcade")
    .setDescription("Midnight Arcade dashboard, leaderboards, and community chat games")
    .addSubcommand(sub =>
      sub
        .setName("dashboard")
        .setDescription("Open your private Midnight Arcade dashboard & game leaderboards")
        .addUserOption(opt => opt.setName("member").setDescription("Member to inspect"))
    )
    .addSubcommand(sub =>
      sub
        .setName("menu")
        .setDescription("View Midnight Arcade rules and active games")
    )
    .addSubcommand(sub =>
      sub
        .setName("madlibs")
        .setDescription("Start a 15-prompt community Madlibs story in this channel")
    )
    .addSubcommand(sub =>
      sub
        .setName("lastletter-start")
        .setDescription("Start a Last Letter word chain in this channel (Manage Server)")
    )
    .addSubcommand(sub =>
      sub
        .setName("lastletter-stop")
        .setDescription("Stop the active Last Letter game in this channel (Manage Server)")
    ),

  // 3. HOLLOW CREATURES
  new SlashCommandBuilder()
    .setName("creatures")
    .setDescription("Collect, view, and gift Hollow creature trading cards")
    .addSubcommand(sub =>
      sub
        .setName("inventory")
        .setDescription("View caught creature cards and fastest catch times")
        .addUserOption(opt => opt.setName("member").setDescription("Member to inspect"))
    )
    .addSubcommand(sub =>
      sub
        .setName("catalog")
        .setDescription("View the 12-species Hollow creature index")
    )
    .addSubcommand(sub =>
      sub
        .setName("profile")
        .setDescription("Render a creature's trading card image")
        .addStringOption(opt =>
          opt.setName("creature").setDescription("Creature name").setAutocomplete(true).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("daily")
        .setDescription("Claim your free daily Hollow creature pack")
    )
    .addSubcommand(sub =>
      sub
        .setName("gift")
        .setDescription("Gift one of your creature cards to another member")
        .addUserOption(opt => opt.setName("member").setDescription("Recipient").setRequired(true))
        .addStringOption(opt =>
          opt.setName("creature").setDescription("Creature name").setAutocomplete(true).setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("leaderboard")
        .setDescription("View creature collection and speed-catch leaderboards")
        .addStringOption(opt =>
          opt
            .setName("type")
            .setDescription("Ranking type")
            .addChoices(
              { name: "Total Creatures Caught", value: "total" },
              { name: "Fastest Catch Time", value: "fastest" },
              { name: "Unique Species Discovered", value: "unique" }
            )
        )
    )
    .addSubcommand(sub =>
      sub
        .setName("achievements")
        .setDescription("View your Hollow creature achievements")
    )
    .addSubcommand(sub =>
      sub
        .setName("setchannel")
        .setDescription("Set the channel where wild creatures spawn (Manage Server)")
        .addChannelOption(opt => opt.setName("channel").setDescription("Target text channel").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("start")
        .setDescription("Start automatic wild creature spawns (Manage Server)")
    )
    .addSubcommand(sub =>
      sub
        .setName("stop")
        .setDescription("Pause automatic wild creature spawns (Manage Server)")
    )
    .addSubcommand(sub =>
      sub
        .setName("spawn")
        .setDescription("Manually spawn a wild creature right now (Manage Server)")
    ),

  // 4. PUBLIC LEADERBOARD
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("Post a public Nest or Arcade leaderboard in chat")
    .addStringOption(opt =>
      opt
        .setName("ranking")
        .setDescription("Leaderboard category")
        .addChoices(
          { name: "Weekly Wellness Points", value: "weekly" },
          { name: "Lifetime Owl XP", value: "lifetime" },
          { name: "Midnight Arcade Overall", value: "arcade" },
          { name: "Last Letter (Words Played)", value: "lastletter" },
          { name: "Community Madlibs (Words Submitted)", value: "madlibs" },
          { name: "Continue the Story (Lines Added)", value: "story" }
        )
    ),

  // 5. NEST JAIL
  new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Manage Nest Jail sentences (Manage Roles)")
    new SlashCommandBuilder()
    .setName("jail")
    .setDescription("Manage Nest Jail sentences (Moderators & Admins only)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand(sub =>
    .addSubcommand(sub =>
      sub
        .setName("lock")
        .setDescription("Send a member to Nest Jail for a set duration")
        .addUserOption(opt => opt.setName("member").setDescription("Member to jail").setRequired(true))
        .addIntegerOption(opt =>
          opt.setName("minutes").setDescription("Sentence duration in minutes").setMinValue(1).setMaxValue(10080).setRequired(true)
        )
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for sentence"))
    )
    .addSubcommand(sub =>
      sub
        .setName("release")
        .setDescription("Release a member from Nest Jail early")
        .addUserOption(opt => opt.setName("member").setDescription("Member to release").setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName("status")
        .setDescription("View everyone currently serving time in Nest Jail")
    ),

  // 6. NEST LORE / ABOUT
  new SlashCommandBuilder()
    .setName("nest")
    .setDescription("Learn about Hootie 2.0 and The Nest"),

  // 7. HELP
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse Hootie 2.0 commands by category"),

  // 8. PING
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check Hootie 2.0's response latency")
].map(cmd => cmd.toJSON());

module.exports = { commands };
