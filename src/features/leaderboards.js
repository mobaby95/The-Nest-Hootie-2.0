const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const db = require("../../database");
const { COLORS } = require("../config/constants");
const { makeEmbed, getLogoAttachment } = require("../utils/embeds");

function buildLeaderboardPayload(ranking) {
  const logo = getLogoAttachment();
  const files = logo ? [logo] : [];

  let title = "";
  let lines = "";
  let color = COLORS.burgundy;

  if (ranking === "lastletter") {
    title = "📝 LAST LETTER LEADERBOARD — WORDS PLAYED";
    color = COLORS.charcoal;
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'lastletter'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();

    lines = rows.length
      ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "word" : "words"}** *(${r.pts} pts)*`
        ).join("\n")
      : "No Last Letter words played yet! Start a round with `/arcade lastletter-start`.";
  } else if (ranking === "madlibs") {
    title = "📖 COMMUNITY MADLIBS LEADERBOARD — WORDS SUBMITTED";
    color = COLORS.charcoal;
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'madlibs'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();

    lines = rows.length
      ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "word" : "words"}** *(${r.pts} pts)*`
        ).join("\n")
      : "No Madlibs words submitted yet! Start a story with `/arcade madlibs`.";
  } else if (ranking === "story") {
    title = "📜 CONTINUE THE STORY LEADERBOARD — LINES ADDED";
    color = COLORS.charcoal;
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'story'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();

    lines = rows.length
      ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "line" : "lines"}** *(${r.pts} pts)*`
        ).join("\n")
      : "No story lines written yet! Moderators can start one with `!story start`.";
  } else if (ranking === "arcade") {
    title = "🦇 MIDNIGHT ARCADE — OVERALL POINTS";
    color = COLORS.charcoal;
    const rows = db.prepare(`
      SELECT user_id, points AS score
      FROM arcade_points
      WHERE points > 0
      ORDER BY score DESC
      LIMIT 10
    `).all();

    lines = rows.length
      ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — **${r.score} Arcade Points**`
        ).join("\n")
      : "No arcade scores yet. Be the first to play!";
  } else {
    const isWeekly = ranking === "weekly";
    const col = isWeekly ? "weekly_points" : "lifetime_points";
    title = isWeekly ? "🏆 WEEKLY WELLNESS POINTS" : "🦉 LIFETIME OWL XP";

    const rows = db.prepare(`
      SELECT user_id, ${col} AS score
      FROM users
      WHERE ${col} > 0
      ORDER BY score DESC
      LIMIT 10
    `).all();

    lines = rows.length
      ? rows.map((r, i) =>
          `**${i + 1}.** <@${r.user_id}> — **${r.score}**`
        ).join("\n")
      : "No scores yet. Be the first to soar!";
  }

  const embed = makeEmbed(title, lines, color);
  if (logo) embed.setThumbnail("attachment://hootie-logo.jpg");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lb:weekly")
      .setLabel("Weekly Wellness")
      .setStyle(ranking === "weekly" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lb:lifetime")
      .setLabel("Owl XP")
      .setStyle(ranking === "lifetime" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lb:arcade")
      .setLabel("Arcade Total")
      .setStyle(ranking === "arcade" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("lb:lastletter")
      .setLabel("Last Letter")
      .setStyle(ranking === "lastletter" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lb:madlibs")
      .setLabel("Madlibs")
      .setStyle(ranking === "madlibs" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("lb:story")
      .setLabel("Story Lines")
      .setStyle(ranking === "story" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2], files };
}

function buildHelpPayload(category = "wellness") {
  const logo = getLogoAttachment();
  const files = logo ? [logo] : [];

  const sections = {
    wellness: {
      title: "🪺 WELLNESS & NEST ARCHIVES COMMANDS",
      body:
        "`/wellness dashboard [member]` — Open your private Nest Archives dashboard.\n" +
        "`/wellness checkin <response> [visibility]` — Daily reflection (+10 pts & streak).\n" +
        "`/wellness water <cups> [visibility]` — Log hydration (up to 20 pts/day).\n" +
        "`/wellness steps <count> [visibility]` — Log daily steps (+5 pts).\n" +
        "`/wellness sleep <hours> [visibility]` — Log hours slept (+5 pts).\n" +
        "`/wellness selfcare <activity> [visibility]` — Log a self-care ritual (+5 pts).\n" +
        "`/wellness workout <activity> [minutes] [visibility]` — Log movement (+5 pts).\n" +
        "`/wellness challenges` — Track your weekly Nest challenges.\n" +
        "`/wellness timezone-set` / `timezone-view` — Manage your local time zone."
    },
    arcade: {
      title: "🦇 MIDNIGHT ARCADE & LEADERBOARDS",
      body:
        "`/arcade dashboard [member]` — Open your private Arcade Dashboard with per-game & overall leaderboards.\n" +
        "`/arcade menu` — View arcade rules and active games.\n" +
        "`/arcade madlibs` — Start a 15-prompt community Madlibs story in chat (+5 pts/word).\n" +
        "`!story start` / `!story end` — *(Mod)* Start or publish a community story in chat (+3 pts/line).\n" +
        "`/arcade lastletter-start` / `lastletter-stop` — *(Mod)* Start or stop a word chain (+5 pts/word).\n" +
        "`/leaderboard` — Post a public leaderboard in chat."
    },
    creatures: {
      title: "🐉 HOLLOW CREATURE TRADING CARDS",
      body:
        "Type **`catch`** in chat first when a wild creature spawns (+10 Arcade Points)!\n\n" +
        "`/creatures inventory [member]` — View stacked creature cards & fastest catch speeds.\n" +
        "`/creatures catalog` — View the 12-creature Hollow index.\n" +
        "`/creatures profile <creature>` — Render a high-res trading card PNG.\n" +
        "`/creatures daily` — Open a free daily Hollow creature pack.\n" +
        "`/creatures gift <member> <creature>` — Gift a creature card to another member.\n" +
        "`/creatures leaderboard` & `/creatures achievements` — Rankings & milestones."
    },
    moderation: {
      title: "🔒 MODERATION COMMANDS",
      body:
        "`/jail lock <member> <minutes> [reason]` — Send a member to Nest Jail with an auto-release timer.\n" +
        "`/jail release <member>` — Release a member from Nest Jail early.\n" +
        "`/jail status` — View all members currently serving time in Nest Jail.\n" +
        "`/creatures setchannel` / `start` / `stop` / `spawn` — Manage automatic creature spawns."
    }
  };

  const active = sections[category] || sections.wellness;
  const embed = makeEmbed(active.title, active.body, COLORS.burgundy);
  if (logo) embed.setThumbnail("attachment://hootie-logo.jpg");

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help:category")
      .setPlaceholder("Choose a command category...")
      .addOptions(
        { label: "🪺 Wellness & Nest Archives", value: "wellness", default: category === "wellness" },
        { label: "🦇 Midnight Arcade & Leaderboards", value: "arcade", default: category === "arcade" },
        { label: "🐉 Hollow Creature Cards", value: "creatures", default: category === "creatures" },
        { label: "🔒 Moderation", value: "moderation", default: category === "moderation" }
      )
  );

  return { embeds: [embed], components: [menu], files };
}

module.exports = {
  buildLeaderboardPayload,
  buildHelpPayload
};
