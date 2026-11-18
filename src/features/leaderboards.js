const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const db = require("../../database");
const { COLORS } = require("../config/constants");
const { makeEmbed, getLogoAttachment } = require("../utils/embeds");
const { renderLeaderboardPodium } = require("../../graphicsRenderer");

async function enrichRows(client, rows, formatScore) {
  const result = [];
  for (const r of rows.slice(0, 10)) {
    let displayName = `Owl ${r.user_id.slice(-4)}`;
    let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    try {
      const user = client?.users?.cache?.get(r.user_id) || (await client?.users?.fetch(r.user_id));
      if (user) {
        displayName = user.username;
        avatarUrl = user.displayAvatarURL({ extension: "png", size: 128 });
      }
    } catch {
      // Fallback
    }
    result.push({
      user_id: r.user_id,
      displayName,
      avatarUrl,
      scoreLabel: formatScore(r)
    });
  }
  return result;
}

async function buildLeaderboardPayload(ranking, client = null) {
  let title = "";
  let subtitle = "THE NEST TOP 10";
  let entries = [];

  if (ranking === "lastletter") {
    title = "LAST LETTER LEADERBOARD";
    subtitle = "WORDS PLAYED";
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'lastletter'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();
    entries = await enrichRows(client, rows, r => `${r.plays} WORDS (${r.pts} PTS)`);
  } else if (ranking === "madlibs") {
    title = "COMMUNITY MADLIBS LEADERBOARD";
    subtitle = "WORDS SUBMITTED";
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'madlibs'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();
    entries = await enrichRows(client, rows, r => `${r.plays} WORDS (${r.pts} PTS)`);
  } else if (ranking === "story") {
    title = "CONTINUE THE STORY LEADERBOARD";
    subtitle = "LINES ADDED";
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'story'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
      LIMIT 10
    `).all();
    entries = await enrichRows(client, rows, r => `${r.plays} LINES (${r.pts} PTS)`);
  } else if (ranking === "arcade") {
    title = "MIDNIGHT ARCADE — OVERALL";
    subtitle = "ARCADE POINTS";
    const rows = db.prepare(`
      SELECT user_id, points AS score
      FROM arcade_points
      WHERE points > 0
      ORDER BY score DESC
      LIMIT 10
    `).all();
    entries = await enrichRows(client, rows, r => `${r.score} PTS`);
  } else {
    const isWeekly = ranking === "weekly";
    const col = isWeekly ? "weekly_points" : "lifetime_points";
    title = isWeekly ? "WEEKLY WELLNESS POINTS" : "LIFETIME OWL XP";
    subtitle = isWeekly ? "THIS WEEK" : "ALL-TIME";
    const rows = db.prepare(`
      SELECT user_id, ${col} AS score
      FROM users
      WHERE ${col} > 0
      ORDER BY score DESC
      LIMIT 10
    `).all();
    entries = await enrichRows(client, rows, r => `${r.score}${isWeekly ? "PTS" : "XP"}`);
  }

  const podium = await renderLeaderboardPodium({ title, subtitle, entries });

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

  return { embeds: [], components: [row1, row2], files: [podium.attachment] };
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
        "`/wellness
