const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");
const db = require("../../database");
const { COLORS, MADLIBS_TEMPLATES, STORY_PROMPTS } = require("../config/constants");
const {
  makeEmbed,
  getLogoAttachment,
  ensureUser,
  randomItem,
  formatContributors,
  splitTextChunks
} = require("../utils/embeds");

function addArcadePoints(userId, amount, reason) {
  ensureUser(userId);
  db.prepare(`UPDATE arcade_points SET points = points + ? WHERE user_id = ?`).run(amount, userId);
  db.prepare(`INSERT INTO arcade_transactions (user_id, points, reason) VALUES (?, ?, ?)`).run(userId, amount, reason);
}

function logGame(userId, gameName, score) {
  db.prepare(`INSERT INTO arcade_game_stats (user_id, game_name, score) VALUES (?, ?, ?)`).run(userId, gameName, score);
}

function recordArcadeGame(userId, game, points, reason) {
  addArcadePoints(userId, points, reason);
  logGame(userId, game, points);
}

function getActiveChannelGame(guildId, channelId) {
  const tracked = db.prepare(`
    SELECT * FROM arcade_community_games WHERE guild_id = ? AND channel_id = ?
  `).get(guildId, channelId);

  if (tracked) return tracked;

  const legacyLastLetter = db.prepare(`
    SELECT * FROM arcade_lastletter_state WHERE guild_id = ? AND channel_id = ?
  `).get(guildId, channelId);

  if (legacyLastLetter) {
    return { guild_id: guildId, channel_id: channelId, game_type: "lastletter", state_json: "{}" };
  }

  return null;
}

function formatGameName(gameType) {
  if (gameType === "madlibs") return "Community Madlibs";
  if (gameType === "story") return "Continue the Story";
  if (gameType === "lastletter") return "Last Letter";
  return "another community game";
}

function restoreActiveChannelGames() {
  const lastLetterRows = db.prepare(`SELECT guild_id, channel_id FROM arcade_lastletter_state`).all();
  for (const row of lastLetterRows) {
    db.prepare(`
      INSERT OR IGNORE INTO arcade_community_games (guild_id, channel_id, game_type, state_json)
      VALUES (?, ?, 'lastletter', '{}')
    `).run(row.guild_id, row.channel_id);
  }
  const activeCount = db.prepare(`SELECT COUNT(*) AS n FROM arcade_community_games`).get().n;
  console.log(`🎮 Restored ${activeCount} active community game(s) from SQLite`);
}

// ==========================================
// 🕹️ PRIVATE ARCADE DASHBOARD
// ==========================================

function getUserRank(rows, targetUserId) {
  const index = rows.findIndex(r => r.user_id === targetUserId);
  return index >= 0 ? `#${index + 1}` : "Unranked";
}

function buildArcadeDashboardPayload(targetUser, tab = "overview") {
  ensureUser(targetUser.id);
  const logo = getLogoAttachment();
  const files = logo ? [logo] : [];

  const totalPoints = db.prepare(`SELECT points FROM arcade_points WHERE user_id = ?`).get(targetUser.id)?.points || 0;
  const gameCounts = db.prepare(`
    SELECT game_name, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
    FROM arcade_game_stats
    WHERE user_id = ?
    GROUP BY game_name
  `).all(targetUser.id);

  const countMap = new Map(gameCounts.map(r => [r.game_name, r]));
  const llStats = countMap.get("lastletter") || { plays: 0, pts: 0 };
  const mlStats = countMap.get("madlibs") || { plays: 0, pts: 0 };
  const stStats = countMap.get("story") || { plays: 0, pts: 0 };
  const ccStats = countMap.get("creature_catch") || { plays: 0, pts: 0 };

  let embed;

  if (tab === "overview") {
    const overallRows = db.prepare(`
      SELECT user_id, points AS score FROM arcade_points WHERE points > 0 ORDER BY score DESC
    `).all();
    const myRank = getUserRank(overallRows, targetUser.id);

    embed = makeEmbed(
      `🦇 ${targetUser.username}'s Midnight Arcade Dashboard`,
      `Total Arcade Points: **${totalPoints}** • Overall Rank: **${myRank}**\n\n` +
      `Use the buttons below to inspect individual game leaderboards and overall Arcade rankings.`,
      COLORS.charcoal
    ).addFields(
      { name: "📝 Last Letter", value: `${llStats.plays} words (${llStats.pts} pts)`, inline: true },
      { name: "📖 Madlibs", value: `${mlStats.plays} words (${mlStats.pts} pts)`, inline: true },
      { name: "📜 Story Lines", value: `${stStats.plays} lines (${stStats.pts} pts)`, inline: true },
      { name: "🐉 Wild Catches", value: `${ccStats.plays} catches (${ccStats.pts} pts)`, inline: true }
    );
  } else if (tab === "overall") {
    const rows = db.prepare(`
      SELECT user_id, points AS score FROM arcade_points WHERE points > 0 ORDER BY score DESC
    `).all();
    const myRank = getUserRank(rows, targetUser.id);
    const top10 = rows.slice(0, 10);

    const lines = top10.length
      ? top10.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.score} Arcade Points**`).join("\n")
      : "No Arcade Points earned yet!";

    embed = makeEmbed(
      "🏆 MIDNIGHT ARCADE — OVERALL LEADERBOARD",
      `${lines}\n\n**${targetUser.username}'s Rank:** ${myRank} (${totalPoints} pts)`,
      COLORS.charcoal
    );
  } else if (tab === "lastletter") {
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'lastletter'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
    `).all();
    const myRank = getUserRank(rows, targetUser.id);
    const top10 = rows.slice(0, 10);

    const lines = top10.length
      ? top10.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "word" : "words"}** *(${r.pts} pts)*`).join("\n")
      : "No Last Letter words played yet!";

    embed = makeEmbed(
      "📝 LAST LETTER — GAME LEADERBOARD",
      `${lines}\n\n**${targetUser.username}'s Rank:** ${myRank} (${llStats.plays} words)`,
      COLORS.charcoal
    );
  } else if (tab === "madlibs") {
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'madlibs'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
    `).all();
    const myRank = getUserRank(rows, targetUser.id);
    const top10 = rows.slice(0, 10);

    const lines = top10.length
      ? top10.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "word" : "words"}** *(${r.pts} pts)*`).join("\n")
      : "No Madlibs words submitted yet!";

    embed = makeEmbed(
      "📖 COMMUNITY MADLIBS — GAME LEADERBOARD",
      `${lines}\n\n**${targetUser.username}'s Rank:** ${myRank} (${mlStats.plays} words)`,
      COLORS.charcoal
    );
  } else {
    const rows = db.prepare(`
      SELECT user_id, COUNT(*) AS plays, COALESCE(SUM(score), 0) AS pts
      FROM arcade_game_stats
      WHERE game_name = 'story'
      GROUP BY user_id
      ORDER BY plays DESC, pts DESC
    `).all();
    const myRank = getUserRank(rows, targetUser.id);
    const top10 = rows.slice(0, 10);

    const lines = top10.length
      ? top10.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.plays} ${r.plays === 1 ? "line" : "lines"}** *(${r.pts} pts)*`).join("\n")
      : "No story lines added yet!";

    embed = makeEmbed(
      "📜 CONTINUE THE STORY — GAME LEADERBOARD",
      `${lines}\n\n**${targetUser.username}'s Rank:** ${myRank} (${stStats.plays} lines)`,
      COLORS.charcoal
    );
  }

  if (logo) embed.setThumbnail("attachment://hootie-logo.jpg");

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`arcade:overview:${targetUser.id}`)
      .setLabel("My Stats")
      .setStyle(tab === "overview" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`arcade:overall:${targetUser.id}`)
      .setLabel("Overall Arcade")
      .setStyle(tab === "overall" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`arcade:lastletter:${targetUser.id}`)
      .setLabel("Last Letter")
      .setStyle(tab === "lastletter" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`arcade:madlibs:${targetUser.id}`)
      .setLabel("Madlibs")
      .setStyle(tab === "madlibs" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`arcade:story:${targetUser.id}`)
      .setLabel("Story Lines")
      .setStyle(tab === "story" ? ButtonStyle.Primary : ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row1, row2], files };
}

async function showArcadeMenu(interaction) {
  const logo = getLogoAttachment();
  const embed = makeEmbed(
    "🦇 The Midnight Arcade",
    "**DASHBOARD & LEADERBOARDS**\n" +
    "`/arcade dashboard [member]` — Open your private Arcade Dashboard with per-game and overall leaderboards.\n" +
    "`/leaderboard` — Post a public leaderboard in chat.\n\n" +
    "**COMMUNITY GAMES (One game per channel at a time)**\n" +
    "`/arcade madlibs` — Start a 15-prompt community Madlibs story in chat (+5 pts/word).\n" +
    "`!story start` / `!story end` — Moderator-led community story in chat (+3 pts/line).\n" +
    "`/arcade lastletter-start` / `/arcade lastletter-stop` — Moderator-led word chain in chat (+5 pts/word).\n\n" +
    "**HOLLOW CREATURE CARDS**\n" +
    "Type **`catch`** in chat first when a wild creature spawns (+10 Arcade Points)!",
    COLORS.charcoal
  );

  if (logo) embed.setThumbnail("attachment://hootie-logo.jpg");

  await interaction.reply({
    embeds: [embed],
    ...(logo ? { files: [logo] } : {})
  });
}

// ==========================================
// 📖 COMMUNITY MADLIBS
// ==========================================

async function startMadlibs(interaction) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Community Madlibs can only be played inside a Nest server channel." });
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  const startResult = db.transaction(() => {
    const existing = getActiveChannelGame(guildId, channelId);
    if (existing) return { ok: false, existing };

    const template = randomItem(MADLIBS_TEMPLATES);
    const state = {
      startedBy: userId,
      templateId: template.id,
      title: template.title,
      prompts: template.prompts,
      answers: [],
      contributors: [],
      lastPlayerId: ""
    };

    db.prepare(`
      INSERT INTO arcade_community_games (guild_id, channel_id, game_type, state_json, updated_at)
      VALUES (?, ?, 'madlibs', ?, CURRENT_TIMESTAMP)
    `).run(guildId, channelId, JSON.stringify(state));

    return { ok: true, template };
  })();

  if (!startResult.ok) {
    await interaction.reply({
      content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`
    });
    return;
  }

  await interaction.reply({
    embeds: [
      makeEmbed(
        "📖 COMMUNITY MADLIBS HAS BEGUN!",
        `A new tale is being woven in The Nest: **${startResult.template.title}**\n\n` +
        `Answer each prompt directly in chat! Anyone can join in, and you can answer multiple times—just not twice in a row.\n` +
        `✨ **+5 Arcade Points** for each accepted answer!\n\n` +
        `**Prompt 1 of ${startResult.template.prompts.length}:** Give me **${startResult.template.prompts[0]}**!`,
        COLORS.charcoal
      )
    ]
  });
}

async function processMadlibsMessage(message) {
  const rawInput = message.content.trim();
  if (!rawInput || rawInput.startsWith("!") || rawInput.startsWith("/")) return;

  const cleanAnswer = rawInput.replace(/\s+/g, " ").trim();
  if (cleanAnswer.length < 1 || cleanAnswer.length > 60) return;

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const txResult = db.transaction(() => {
    const active = db.prepare(`
      SELECT * FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'madlibs'
    `).get(guildId, channelId);

    if (!active) return { status: "inactive" };

    let state;
    try { state = JSON.parse(active.state_json); } catch { return { status: "corrupt" }; }

    const prompts = Array.isArray(state.prompts) ? state.prompts : [];
    const answers = Array.isArray(state.answers) ? state.answers : [];
    const contributors = Array.isArray(state.contributors) ? state.contributors : [];

    if (answers.length >= prompts.length) return { status: "inactive" };
    if (state.lastPlayerId === userId) return { status: "same_player" };

    answers.push(cleanAnswer);
    contributors.push(userId);
    state.answers = answers;
    state.contributors = contributors;
    state.lastPlayerId = userId;

    recordArcadeGame(userId, "madlibs", 5, `Community Madlibs (${answers.length}/${prompts.length})`);

    if (answers.length >= prompts.length) {
      const template = MADLIBS_TEMPLATES.find(t => t.id === state.templateId) || MADLIBS_TEMPLATES[0];
      const completedStory = template.build(answers);

      db.prepare(`
        INSERT INTO arcade_madlibs (guild_id, channel_id, user_id, story_text)
        VALUES (?, ?, ?, ?)
      `).run(guildId, channelId, state.startedBy || userId, completedStory);

      db.prepare(`
        DELETE FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'madlibs'
      `).run(guildId, channelId);

      return { status: "completed", title: template.title, story: completedStory, contributors, acceptedAnswer: cleanAnswer };
    }

    db.prepare(`
      UPDATE arcade_community_games SET state_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND channel_id = ? AND game_type = 'madlibs'
    `).run(JSON.stringify(state), guildId, channelId);

    return {
      status: "next_prompt",
      acceptedAnswer: cleanAnswer,
      stepNumber: answers.length + 1,
      totalPrompts: prompts.length,
      nextPrompt: prompts[answers.length]
    };
  })();

  if (txResult.status === "inactive" || txResult.status === "corrupt") return;

  if (txResult.status === "same_player") {
    await message.reply({ content: "🪶 Give another night owl a turn before submitting the next Madlibs word!" });
    return;
  }

  if (txResult.status === "next_prompt") {
    await message.reply({
      embeds: [
        makeEmbed(
          "📖 WORD ACCEPTED!",
          `**${message.author.username}** added **${txResult.acceptedAnswer}**! ✨ **+5 Arcade Points**\n\n` +
          `**Prompt ${txResult.stepNumber} of ${txResult.totalPrompts}:** Give me **${txResult.nextPrompt}**!`,
          COLORS.charcoal
        )
      ]
    });
    return;
  }

  if (txResult.status === "completed") {
    await message.reply({
      embeds: [
        makeEmbed(
          `📚 ${txResult.title.toUpperCase()}`,
          `**${message.author.username}** supplied the final word (**${txResult.acceptedAnswer}**) and earned **+5 Arcade Points**!\n\n` +
          `${txResult.story}\n\n` +
          `**Contributors:** ${formatContributors(txResult.contributors)}`,
          COLORS.crimson
        )
      ]
    });
  }
}

// ==========================================
// 📜 CONTINUE THE STORY (!story start / !story end)
// ==========================================

async function handleStoryPrefixCommand(message, action) {
  if (!message.member?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    await message.reply({ content: "Only members with **Manage Server** permission can start or end Continue the Story." });
    return;
  }

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  if (action === "start") {
    const startResult = db.transaction(() => {
      const existing = getActiveChannelGame(guildId, channelId);
      if (existing) return { ok: false, existing };

      const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const prompt = randomItem(STORY_PROMPTS);

      const markerInsert = db.prepare(`
        INSERT INTO arcade_story_contributions (guild_id, channel_id, user_id, contribution)
        VALUES (?, ?, 'SYSTEM_START', ?)
      `).run(guildId, channelId, `[SESSION:${sessionId}] ${prompt}`);

      const state = {
        sessionId,
        prompt,
        startedBy: userId,
        lastPlayerId: "",
        startRowId: Number(markerInsert.lastInsertRowid)
      };

      db.prepare(`
        INSERT INTO arcade_community_games (guild_id, channel_id, game_type, state_json, updated_at)
        VALUES (?, ?, 'story', ?, CURRENT_TIMESTAMP)
      `).run(guildId, channelId, JSON.stringify(state));

      return { ok: true, prompt };
    })();

    if (!startResult.ok) {
      await message.reply({
        content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`
      });
      return;
    }

    await message.channel.send({
      embeds: [
        makeEmbed(
          "📜 CONTINUE THE STORY HAS BEGUN!",
          `**Story Prompt:**\n*${startResult.prompt}*\n\n` +
          `Type your next part of the story directly in chat (**1–500 characters**).\n` +
          `• You can contribute multiple times, just not twice in a row.\n` +
          `• Each accepted line earns **+3 Arcade Points**.\n` +
          `• Moderators can end the round anytime with \`!story end\`.`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (action === "end") {
    const endResult = db.transaction(() => {
      const active = db.prepare(`
        SELECT * FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'story'
      `).get(guildId, channelId);

      if (!active) return { ok: false };

      let state = {};
      try { state = JSON.parse(active.state_json || "{}"); } catch { state = {}; }

      let minId = Number(state.startRowId) || 0;
      if (!minId && state.sessionId) {
        const startMarker = db.prepare(`
          SELECT id FROM arcade_story_contributions
          WHERE guild_id = ? AND channel_id = ? AND user_id = 'SYSTEM_START' AND contribution LIKE ?
          ORDER BY id DESC LIMIT 1
        `).get(guildId, channelId, `[SESSION:${state.sessionId}]%`);
        minId = startMarker ? startMarker.id : 0;
      }

      const entries = db.prepare(`
        SELECT id, user_id, contribution FROM arcade_story_contributions
        WHERE guild_id = ? AND channel_id = ? AND id > ? AND user_id NOT IN ('SYSTEM_START', 'SYSTEM_END')
        ORDER BY id ASC
      `).all(guildId, channelId, minId);

      if (state.sessionId) {
        db.prepare(`
          INSERT INTO arcade_story_contributions (guild_id, channel_id, user_id, contribution)
          VALUES (?, ?, 'SYSTEM_END', ?)
        `).run(guildId, channelId, `[SESSION_END:${state.sessionId}]`);
      }

      db.prepare(`
        DELETE FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'story'
      `).run(guildId, channelId);

      return { ok: true, prompt: state.prompt || "A tale spun in The Nest", entries };
    })();

    if (!endResult.ok) {
      await message.reply({ content: "There isn't an active **Continue the Story** game in this channel." });
      return;
    }

    if (!endResult.entries.length) {
      await message.channel.send({
        embeds: [makeEmbed("📜 CONTINUE THE STORY ENDED", `**Prompt:** *${endResult.prompt}*\n\nNo story lines were added this round.`, COLORS.charcoal)]
      });
      return;
    }

    const fullStory = endResult.entries.map(entry => entry.contribution).join(" ");
    const contributors = formatContributors(endResult.entries.map(entry => entry.user_id));
    const storyChunks = splitTextChunks(fullStory, 3500);

    for (let i = 0; i < storyChunks.length; i++) {
      const isFirst = i === 0;
      const isLast = i === storyChunks.length - 1;
      let description = isFirst ? `**Prompt:** *${endResult.prompt}*\n\n` : "";
      description += storyChunks[i];
      if (isLast) description += `\n\n**Contributors:** ${contributors}`;

      await message.channel.send({
        embeds: [makeEmbed(isFirst ? "📚 THE COMPLETED NEST STORY" : `📚 THE COMPLETED NEST STORY (Part ${i + 1})`, description, COLORS.crimson)]
      });
    }
  }
}

async function processStoryMessage(message) {
  const contribution = message.content.trim();
  if (!contribution || contribution.startsWith("!") || contribution.startsWith("/")) return;

  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const txResult = db.transaction(() => {
    const active = db.prepare(`
      SELECT * FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'story'
    `).get(guildId, channelId);

    if (!active) return { status: "inactive" };

    let state = {};
    try { state = JSON.parse(active.state_json || "{}"); } catch { return { status: "corrupt" }; }

    if (contribution.length < 1 || contribution.length > 500) {
      return { status: "invalid_length", length: contribution.length };
    }
    if (state.lastPlayerId === userId) return { status: "same_player" };

    db.prepare(`
      INSERT INTO arcade_story_contributions (guild_id, channel_id, user_id, contribution)
      VALUES (?, ?, ?, ?)
    `).run(guildId, channelId, userId, contribution);

    state.lastPlayerId = userId;
    db.prepare(`
      UPDATE arcade_community_games SET state_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND channel_id = ? AND game_type = 'story'
    `).run(JSON.stringify(state), guildId, channelId);

    recordArcadeGame(userId, "story", 3, "Added to Continue the Story");
    return { status: "accepted" };
  })();

  if (txResult.status === "inactive" || txResult.status === "corrupt") return;

  if (txResult.status === "invalid_length") {
    await message.reply({ content: `📜 Your story contribution must be between **1 and 500 characters** (yours was ${txResult.length}).` });
    return;
  }

  if (txResult.status === "same_player") {
    await message.reply({ content: "🪶 Give another night owl a turn before adding the next part of the story!" });
    return;
  }

  if (txResult.status === "accepted") {
    await message.reply({
      embeds: [
        makeEmbed(
          "📜 LINE ADDED TO THE STORY!",
          `**${message.author.username}** continued the tale! ✨ **+3 Arcade Points**\n\n` +
          `Keep going in chat, or a moderator can finish and publish the story with \`!story end\`.`,
          COLORS.charcoal
        )
      ]
    });
  }
}

// ==========================================
// 📝 LAST LETTER
// ==========================================

function getRandomStartingLetter() {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  return letters[Math.floor(Math.random() * letters.length)];
}

async function handleLastLetterSubcommand(interaction, action) {
  if (!interaction.guildId) {
    await interaction.reply({ content: "Last Letter can only be played inside a Nest server channel." });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Only members with Manage Server permission can start or stop Last Letter." });
    return;
  }

  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  if (action === "start") {
    const startingLetter = getRandomStartingLetter();

    const startResult = db.transaction(() => {
      const existing = getActiveChannelGame(guildId, channelId);
      if (existing) return { ok: false, existing };

      db.prepare(`
        INSERT INTO arcade_community_games (guild_id, channel_id, game_type, state_json, updated_at)
        VALUES (?, ?, 'lastletter', ?, CURRENT_TIMESTAMP)
      `).run(guildId, channelId, JSON.stringify({ startedBy: userId }));

      db.prepare(`
        INSERT INTO arcade_lastletter_state (
          guild_id, channel_id, current_letter, last_player_id, used_words, round_count, updated_at
        )
        VALUES (?, ?, ?, '', '[]', 0, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id, channel_id) DO UPDATE SET
          current_letter = excluded.current_letter,
          last_player_id = '',
          used_words = '[]',
          round_count = 0,
          updated_at = CURRENT_TIMESTAMP
      `).run(guildId, channelId, startingLetter);

      return { ok: true, startingLetter };
    })();

    if (!startResult.ok) {
      await interaction.reply({
        content: `🌙 **${formatGameName(startResult.existing.game_type)}** is already active in this channel! Finish or end it before starting another game.`
      });
      return;
    }

    await interaction.reply({
      embeds: [
        makeEmbed(
          "📝 LAST LETTER IS OPEN!",
          `The Nest word chain has begun!\n\n` +
          `**Starting letter: ${startResult.startingLetter.toUpperCase()}**\n\n` +
          `Type a word (2–30 English letters) directly into this channel that starts with **${startResult.startingLetter.toUpperCase()}**.\n\n` +
          "The next player must use the last letter of the previous word. No repeated words, and no taking two turns in a row!\n\n" +
          "**Each valid word earns +5 Arcade Points.**",
          COLORS.charcoal
        )
      ]
    });
    return;
  }

  if (action === "stop") {
    const stopResult = db.transaction(() => {
      const state = db.prepare(`SELECT round_count FROM arcade_lastletter_state WHERE guild_id = ? AND channel_id = ?`).get(guildId, channelId);
      const deletedState = db.prepare(`DELETE FROM arcade_lastletter_state WHERE guild_id = ? AND channel_id = ?`).run(guildId, channelId);
      const deletedLock = db.prepare(`DELETE FROM arcade_community_games WHERE guild_id = ? AND channel_id = ? AND game_type = 'lastletter'`).run(guildId, channelId);

      return {
        stopped: deletedState.changes > 0 || deletedLock.changes > 0,
        roundCount: state?.round_count || 0
      };
    })();

    await interaction.reply({
      embeds: [
        makeEmbed(
          "🌙 LAST LETTER HAS ENDED",
          stopResult.stopped
            ? `The word chain has been closed after **${stopResult.roundCount}** valid words. Thanks for playing, night owls!`
            : "There isn't an active Last Letter game in this channel.",
          COLORS.burgundy
        )
      ]
    });
  }
}

async function processLastLetterMessage(message) {
  const rawWord = message.content.trim();
  if (!/^[a-zA-Z]{2,30}$/.test(rawWord)) return;

  const word = rawWord.toLowerCase();
  const guildId = message.guild.id;
  const channelId = message.channel.id;
  const userId = message.author.id;

  const result = db.transaction(() => {
    const state = db.prepare(`SELECT * FROM arcade_lastletter_state WHERE guild_id = ? AND channel_id = ?`).get(guildId, channelId);
    if (!state) return { status: "inactive" };

    let usedWords = [];
    try {
      usedWords = JSON.parse(state.used_words || "[]");
      if (!Array.isArray(usedWords)) usedWords = [];
    } catch { usedWords = []; }

    if (usedWords.includes(word)) return { status: "duplicate", word };
    if (state.current_letter && word[0] !== state.current_letter.toLowerCase()) {
      return { status: "wrong_letter", requiredLetter: state.current_letter };
    }
    if (state.last_player_id === userId) return { status: "same_player" };

    usedWords.push(word);
    const nextLetter = word[word.length - 1];

    db.prepare(`
      UPDATE arcade_lastletter_state
      SET current_letter = ?, last_player_id = ?, used_words = ?, round_count = round_count + 1, updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND channel_id = ?
    `).run(nextLetter, userId, JSON.stringify(usedWords), guildId, channelId);

    db.prepare(`
      UPDATE arcade_community_games SET updated_at = CURRENT_TIMESTAMP
      WHERE guild_id = ? AND channel_id = ? AND game_type = 'lastletter'
    `).run(guildId, channelId);

    recordArcadeGame(userId, "lastletter", 5, `Last Letter: ${word}`);
    return { status: "accepted", word, nextLetter, roundCount: usedWords.length };
  })();

  if (result.status === "inactive") return;

  if (result.status === "duplicate") {
    await message.reply({ content: `🌙 **${result.word}** has already been used in this round. Try another word!` });
    return;
  }

  if (result.status === "wrong_letter") {
    await message.reply({ content: `🦉 Not quite! The next word must start with **${result.requiredLetter.toUpperCase()}**.` });
    return;
  }

  if (result.status === "same_player") {
    await message.reply({ content: "🪶 Give another night owl a turn before playing again!" });
    return;
  }

  if (result.status === "accepted") {
    await message.reply({
      embeds: [
        makeEmbed(
          "🔤 WORD ACCEPTED!",
          `**${message.author.username}** played **${result.word}**!\n\n` +
          `The next word must start with **${result.nextLetter.toUpperCase()}**.\n\n` +
          `✨ **+5 Arcade Points**\n` +
          `📝 Words played this round: **${result.roundCount}**`,
          COLORS.charcoal
        )
      ]
    });
  }
}

async function handleArcadeCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "dashboard") {
    const member = interaction.options.getUser("member") || interaction.user;
    await interaction.reply({
      ...buildArcadeDashboardPayload(member, "overview"),
      ephemeral: true
    });
    return;
  }
  if (subcommand === "menu") return showArcadeMenu(interaction);
  if (subcommand === "madlibs") return startMadlibs(interaction);
  if (subcommand === "lastletter-start") return handleLastLetterSubcommand(interaction, "start");
  if (subcommand === "lastletter-stop") return handleLastLetterSubcommand(interaction, "stop");
}

module.exports = {
  recordArcadeGame,
  getActiveChannelGame,
  restoreActiveChannelGames,
  buildArcadeDashboardPayload,
  handleArcadeCommand,
  processMadlibsMessage,
  handleStoryPrefixCommand,
  processStoryMessage,
  processLastLetterMessage
};
