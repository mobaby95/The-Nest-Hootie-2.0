const { PermissionFlagsBits } = require("discord.js");
const db = require("../../database");
const { renderCreatureCard } = require("../../cardRenderer");
const {
  COLORS,
  RARITY_SPAWN_WEIGHTS,
  CREATURE_ACHIEVEMENTS,
  SPAWN_MIN_MS,
  SPAWN_MAX_MS,
  SPAWN_LIFETIME_MS
} = require("../config/constants");
const { makeEmbed, localDate, getTimezone, randomItem } = require("../utils/embeds");
const { recordArcadeGame } = require("./arcade");

let spawnTimer = null;

function evaluateCreatureAchievements(userId, latestCatchMs = null, latestRarity = null) {
  const totals = db.prepare(`
    SELECT COALESCE(SUM(count), 0) AS total_cards, COUNT(*) AS unique_species
    FROM user_creatures
    WHERE user_id = ? AND count > 0
  `).get(userId);

  const giftsSent = db.prepare(`
    SELECT gifts_count FROM creature_gifts_sent WHERE user_id = ?
  `).get(userId)?.gifts_count || 0;

  const earned = new Set(
    db.prepare(`SELECT achievement_id FROM creature_achievements WHERE user_id = ?`)
      .all(userId)
      .map(r => r.achievement_id)
  );

  const checks = {
    first_catch: totals.total_cards >= 1,
    catch_10: totals.total_cards >= 10,
    catch_50: totals.total_cards >= 50,
    speed_demon: latestCatchMs !== null && latestCatchMs < 1500,
    lightning_owl: latestCatchMs !== null && latestCatchMs < 800,
    unique_6: totals.unique_species >= 6,
    unique_12: totals.unique_species >= 12,
    mythic_tamer: latestRarity === "Mythic",
    generous_owl: giftsSent >= 1
  };

  const unlocked = [];
  for (const [id, title, desc] of CREATURE_ACHIEVEMENTS) {
    if (checks[id] && !earned.has(id)) {
      db.prepare(`
        INSERT OR IGNORE INTO creature_achievements (user_id, achievement_id)
        VALUES (?, ?)
      `).run(userId, id);
      unlocked.push({ id, title, desc });
    }
  }
  return unlocked;
}

function grantCreatureToUser(userId, creatureId, catchTimeMs = null) {
  db.prepare(`
    INSERT INTO user_creatures (user_id, creature_id, count, fastest_catch_ms)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(user_id, creature_id) DO UPDATE SET
      count = user_creatures.count + 1,
      fastest_catch_ms = CASE
        WHEN excluded.fastest_catch_ms IS NULL THEN user_creatures.fastest_catch_ms
        WHEN user_creatures.fastest_catch_ms IS NULL THEN excluded.fastest_catch_ms
        ELSE MIN(user_creatures.fastest_catch_ms, excluded.fastest_catch_ms)
      END
  `).run(userId, creatureId, catchTimeMs);

  return db.prepare(`
    SELECT count, fastest_catch_ms
    FROM user_creatures
    WHERE user_id = ? AND creature_id = ?
  `).get(userId, creatureId);
}

function selectWeightedCreature(catalog) {
  if (!catalog.length) return null;

  const byRarity = new Map();
  for (const creature of catalog) {
    const key = (creature.rarity || "").trim();
    if (!byRarity.has(key)) byRarity.set(key, []);
    byRarity.get(key).push(creature);
  }

  const availableWeights = RARITY_SPAWN_WEIGHTS.filter(
    entry => (byRarity.get(entry.rarity)?.length || 0) > 0
  );

  if (!availableWeights.length) return randomItem(catalog);

  const totalWeight = availableWeights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;
  let chosenRarity = availableWeights[0].rarity;

  for (const entry of availableWeights) {
    if (roll < entry.weight) {
      chosenRarity = entry.rarity;
      break;
    }
    roll -= entry.weight;
  }

  return randomItem(byRarity.get(chosenRarity));
}

function randomSpawnDelay() {
  return Math.floor(SPAWN_MIN_MS + Math.random() * (SPAWN_MAX_MS - SPAWN_MIN_MS));
}

function scheduleNextSpawn(client) {
  if (spawnTimer) clearTimeout(spawnTimer);

  spawnTimer = setTimeout(async () => {
    try {
      const servers = db.prepare(`
        SELECT guild_id, channel_id FROM creature_spawn_channels WHERE enabled = 1
      `).all();

      for (const server of servers) {
        await spawnCreature(client, server.guild_id, server.channel_id);
      }
    } catch (error) {
      console.error("Automatic creature spawn error:", error);
    }
    scheduleNextSpawn(client);
  }, randomSpawnDelay());
}

async function expireCreatureSpawn(client, spawnId, channelId, messageId, creatureName, delay) {
  setTimeout(async () => {
    const expired = db.prepare(`
      UPDATE creature_spawns SET status = 'expired' WHERE id = ? AND status = 'active'
    `).run(spawnId);

    if (expired.changes) {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel?.isTextBased()) {
        if (messageId) {
          const spawnMsg = await channel.messages.fetch(messageId).catch(() => null);
          if (spawnMsg) {
            await spawnMsg.edit({
              embeds: [makeEmbed("🌙 CREATURE ESCAPED", `**${creatureName}** slipped back into the Hollow.`, COLORS.charcoal)]
            }).catch(() => {});
          }
        }
        await channel.send({
          content: `🌙 **${creatureName}** slipped back into the Hollow. Better luck next time!`
        }).catch(() => {});
      }
    }
  }, Math.max(0, delay));
}

async function spawnCreature(client, guildId, channelId) {
  const now = new Date();
  const active = db.prepare(`
    SELECT id FROM creature_spawns WHERE guild_id = ? AND status = 'active' AND expires_at > ? LIMIT 1
  `).get(guildId, now.toISOString());

  if (active) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    console.log(`Creature spawn channel unavailable for server ${guildId}`);
    return false;
  }

  const catalog = db.prepare(`SELECT * FROM creature_catalog`).all();
  if (!catalog.length) {
    console.error("Creature catalog is empty.");
    return false;
  }

  const creature = selectWeightedCreature(catalog);
  const expires = new Date(now.getTime() + SPAWN_LIFETIME_MS);

  const result = db.prepare(`
    INSERT INTO creature_spawns (guild_id, channel_id, creature_id, status, spawned_at, expires_at)
    VALUES (?, ?, ?, 'active', ?, ?)
  `).run(guildId, channelId, creature.creature_id, now.toISOString(), expires.toISOString());

  const spawnId = Number(result.lastInsertRowid);

  try {
    const card = await renderCreatureCard(creature, { mode: "spawn" });

    const embed = makeEmbed(
      "🌲 A WILD CREATURE HAS APPEARED!",
      `A wild **${creature.creature_name}** (*${creature.rarity} ${creature.creature_type}*) appeared in the Hollow!\n` +
      `Be the **first** to type **\`catch\`** in chat to claim this trading card!`,
      COLORS.crimson
    ).setImage(`attachment://${card.fileName}`);

    const message = await channel.send({
      embeds: [embed],
      files: [card.attachment]
    });

    db.prepare(`UPDATE creature_spawns SET message_id = ? WHERE id = ?`).run(message.id, spawnId);
    expireCreatureSpawn(client, spawnId, channelId, message.id, creature.creature_name, SPAWN_LIFETIME_MS);
    return true;
  } catch (error) {
    db.prepare(`UPDATE creature_spawns SET status = 'expired' WHERE id = ?`).run(spawnId);
    console.error("Could not post creature spawn:", error);
    return false;
  }
}

async function trySpeedCatchInChat(message) {
  const now = new Date();
  const nowIso = now.toISOString();

  const claimResult = db.transaction(() => {
    const spawn = db.prepare(`
      SELECT s.*, c.creature_name, c.creature_type, c.rarity, c.description
      FROM creature_spawns s
      JOIN creature_catalog c ON c.creature_id = s.creature_id
      WHERE s.guild_id = ? AND s.channel_id = ? AND s.status = 'active' AND s.expires_at > ?
      ORDER BY s.id DESC LIMIT 1
    `).get(message.guild.id, message.channel.id, nowIso);

    if (!spawn) return null;

    const catchTimeMs = Math.max(1, now.getTime() - new Date(spawn.spawned_at).getTime());

    const updated = db.prepare(`
      UPDATE creature_spawns
      SET status = 'caught', caught_by = ?, caught_at = ?, catch_time_ms = ?
      WHERE id = ? AND status = 'active'
    `).run(message.author.id, nowIso, catchTimeMs, spawn.id);

    if (!updated.changes) return null;

    const userRecord = grantCreatureToUser(message.author.id, spawn.creature_id, catchTimeMs);
    recordArcadeGame(message.author.id, "creature_catch", 10, `Speed-caught ${spawn.creature_name}`);
    const achievements = evaluateCreatureAchievements(message.author.id, catchTimeMs, spawn.rarity);

    return { spawn, catchTimeMs, userRecord, achievements };
  })();

  if (!claimResult) return false;

  const { spawn, catchTimeMs, userRecord, achievements } = claimResult;

  if (spawn.message_id) {
    const spawnMsg = await message.channel.messages.fetch(spawn.message_id).catch(() => null);
    if (spawnMsg) {
      await spawnMsg.edit({
        embeds: [
          makeEmbed(
            "✅ WILD CREATURE CLAIMED",
            `**${spawn.creature_name}** (*${spawn.rarity}*) was caught by ${message.author} in **${(catchTimeMs / 1000).toFixed(2)}s**!`,
            COLORS.charcoal
          )
        ]
      }).catch(() => {});
    }
  }

  const card = await renderCreatureCard(spawn, {
    mode: "caught",
    catcherName: message.author.username,
    catchTimeMs,
    ownedCount: userRecord.count
  });

  let description =
    `🎉 **${message.author}** caught **${spawn.creature_name}** in **${(catchTimeMs / 1000).toFixed(2)}s**!\n` +
    `📦 Owned: **x${userRecord.count}** • ✨ **+10 Arcade Points**`;

  if (achievements.length) {
    description += `\n\n🏅 **Achievement Unlocked:** ${achievements.map(a => a.title).join(", ")}`;
  }

  const embed = makeEmbed("✨ CREATURE CAUGHT!", description, COLORS.crimson)
    .setImage(`attachment://${card.fileName}`);

  await message.reply({
    embeds: [embed],
    files: [card.attachment]
  });

  return true;
}

function restoreCreatureSpawns(client) {
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE creature_spawns SET status = 'expired' WHERE status = 'active' AND expires_at <= ?
  `).run(now);

  const activeSpawns = db.prepare(`
    SELECT s.id, s.channel_id, s.message_id, s.expires_at, c.creature_name
    FROM creature_spawns s
    JOIN creature_catalog c ON c.creature_id = s.creature_id
    WHERE s.status = 'active' AND s.expires_at > ?
  `).all(now);

  for (const spawn of activeSpawns) {
    const remaining = new Date(spawn.expires_at).getTime() - Date.now();
    expireCreatureSpawn(client, spawn.id, spawn.channel_id, spawn.message_id, spawn.creature_name, remaining);
  }

  scheduleNextSpawn(client);
}

async function handleCreatureCommand(interaction, client) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  if (subcommand === "inventory") {
    const targetUser = interaction.options.getUser("member") || interaction.user;

    const rows = db.prepare(`
      SELECT c.*, uc.count, uc.fastest_catch_ms
      FROM user_creatures uc
      JOIN creature_catalog c ON c.creature_id = uc.creature_id
      WHERE uc.user_id = ? AND uc.count > 0
      ORDER BY
        CASE c.rarity
          WHEN 'Mythic' THEN 1
          WHEN 'Legendary' THEN 2
          WHEN 'Ultra Rare' THEN 3
          WHEN 'Rare' THEN 4
          WHEN 'Uncommon' THEN 5
          ELSE 6
        END,
        c.creature_name
    `).all(targetUser.id);

    const totalCards = rows.reduce((sum, r) => sum + r.count, 0);
    const lines = rows.length
      ? rows.map(r => {
          const speed = r.fastest_catch_ms ? ` · ⚡ ${(r.fastest_catch_ms / 1000).toFixed(2)}s` : "";
          return `**${r.creature_name}** \`x${r.count}\` — *${r.rarity} ${r.creature_type}*${speed}`;
        }).join("\n")
      : "No creatures caught yet! Watch the spawn channel and type `catch` first.";

    await interaction.reply({
      embeds: [
        makeEmbed(
          `🎒 ${targetUser.username}'s Creature Inventory`,
          `${lines}\n\n**Total Cards:** ${totalCards} • **Unique Species:** ${rows.length}/12`,
          COLORS.charcoal
        )
      ]
    });
    return;
  }

  if (subcommand === "catalog") {
    const catalog = db.prepare(`
      SELECT * FROM creature_catalog
      ORDER BY
        CASE rarity
          WHEN 'Mythic' THEN 1
          WHEN 'Legendary' THEN 2
          WHEN 'Ultra Rare' THEN 3
          WHEN 'Rare' THEN 4
          WHEN 'Uncommon' THEN 5
          ELSE 6
        END,
        creature_name
    `).all();

    const ownedMap = new Map(
      db.prepare(`SELECT creature_id, count FROM user_creatures WHERE user_id = ? AND count > 0`)
        .all(userId)
        .map(r => [r.creature_id, r.count])
    );

    const lines = catalog.map(c => {
      const count = ownedMap.get(c.creature_id) || 0;
      return count > 0
        ? `✅ **${c.creature_name}** (\`${c.rarity}\` • ${c.creature_type}) — **x${count}**`
        : `⬛ **???** (\`${c.rarity}\` • ${c.creature_type}) — *Uncaught*`;
    }).join("\n");

    await interaction.reply({
      embeds: [
        makeEmbed(
          `📖 ${interaction.user.username.toUpperCase()}'S CREATURE CATALOG`,
          `${lines}\n\n**Discovered:** ${ownedMap.size}/${catalog.length}`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (subcommand === "profile") {
    const query = interaction.options.getString("creature", true).trim();
    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "That creature isn't in the Hollow catalog." });
      return;
    }

    await interaction.deferReply();

    const owned = db.prepare(`
      SELECT count, fastest_catch_ms FROM user_creatures WHERE user_id = ? AND creature_id = ?
    `).get(userId, creature.creature_id) || { count: 0, fastest_catch_ms: null };

    const card = await renderCreatureCard(creature, {
      mode: "profile",
      ownedCount: owned.count,
      fastestMs: owned.fastest_catch_ms
    });

    const embed = makeEmbed(
      `🃏 ${creature.creature_name} — Trading Card`,
      `**Rarity:** ${creature.rarity} • **Type:** ${creature.creature_type}\n` +
      `**Owned by ${interaction.user.username}:** x${owned.count}`,
      COLORS.charcoal
    ).setImage(`attachment://${card.fileName}`);

    await interaction.editReply({ embeds: [embed], files: [card.attachment] });
    return;
  }

  if (subcommand === "daily") {
    const today = localDate(getTimezone(userId));
    const lastClaim = db.prepare(`SELECT last_claim_date FROM creature_daily_claims WHERE user_id = ?`).get(userId);

    if (lastClaim && lastClaim.last_claim_date === today) {
      await interaction.reply({
        content: "🌙 You've already claimed today's daily creature card! Come back after midnight in your saved `/wellness timezone-set`."
      });
      return;
    }

    await interaction.deferReply();

    const catalog = db.prepare(`SELECT * FROM creature_catalog`).all();
    const creature = selectWeightedCreature(catalog);

    db.prepare(`
      INSERT INTO creature_daily_claims (user_id, last_claim_date)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_claim_date = excluded.last_claim_date
    `).run(userId, today);

    const record = grantCreatureToUser(userId, creature.creature_id, null);
    const achievements = evaluateCreatureAchievements(userId, null, creature.rarity);

    const card = await renderCreatureCard(creature, {
      mode: "profile",
      ownedCount: record.count,
      fastestMs: record.fastest_catch_ms
    });

    let desc = `🎁 **${interaction.user.username}** opened their daily Hollow pack and pulled **${creature.creature_name}** (*${creature.rarity}*)!\n📦 Owned: **x${record.count}**`;
    if (achievements.length) {
      desc += `\n🏅 **Achievement Unlocked:** ${achievements.map(a => a.title).join(", ")}`;
    }

    await interaction.editReply({
      embeds: [makeEmbed("🎁 DAILY HOLLOW CREATURE", desc, COLORS.crimson).setImage(`attachment://${card.fileName}`)],
      files: [card.attachment]
    });
    return;
  }

  if (subcommand === "gift") {
    const recipient = interaction.options.getUser("member", true);
    const query = interaction.options.getString("creature", true).trim();

    if (recipient.bot || recipient.id === userId) {
      await interaction.reply({ content: "You must choose another server member to gift a creature to." });
      return;
    }

    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "Couldn't find that creature." });
      return;
    }

    const giftResult = db.transaction(() => {
      const senderRow = db.prepare(`SELECT count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
      if (!senderRow || senderRow.count < 1) return { ok: false };

      db.prepare(`UPDATE user_creatures SET count = count - 1 WHERE user_id = ? AND creature_id = ?`).run(userId, creature.creature_id);
      grantCreatureToUser(recipient.id, creature.creature_id, null);

      db.prepare(`
        INSERT INTO creature_gifts_sent (user_id, gifts_count)
        VALUES (?, 1)
        ON CONFLICT(user_id) DO UPDATE SET gifts_count = creature_gifts_sent.gifts_count + 1
      `).run(userId);

      evaluateCreatureAchievements(userId);
      evaluateCreatureAchievements(recipient.id, null, creature.rarity);
      return { ok: true };
    })();

    if (!giftResult.ok) {
      await interaction.reply({ content: `You don't have any **${creature.creature_name}** cards in your inventory to gift!` });
      return;
    }

    await interaction.reply({
      embeds: [
        makeEmbed(
          "🎀 CREATURE GIFTED!",
          `🦉 <@${userId}> gifted **1x ${creature.creature_name}** (*${creature.rarity}*) to <@${recipient.id}>!`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (subcommand === "leaderboard") {
    const type = interaction.options.getString("type") || "total";

    if (type === "fastest") {
      const rows = db.prepare(`
        SELECT uc.user_id, MIN(uc.fastest_catch_ms) AS best_ms, c.creature_name
        FROM user_creatures uc
        JOIN creature_catalog c ON c.creature_id = uc.creature_id
        WHERE uc.fastest_catch_ms IS NOT NULL
        GROUP BY uc.user_id
        ORDER BY best_ms ASC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${(r.best_ms / 1000).toFixed(2)}s** (*${r.creature_name}*)`).join("\n")
        : "No timed catches recorded yet!";

      await interaction.reply({ embeds: [makeEmbed("⚡ FASTEST CATCH LEADERBOARD", lines, COLORS.charcoal)] });
      return;
    }

    if (type === "unique") {
      const rows = db.prepare(`
        SELECT user_id, COUNT(*) AS score
        FROM user_creatures
        WHERE count > 0
        GROUP BY user_id
        ORDER BY score DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.score}/12 species**`).join("\n")
        : "No creatures collected yet!";

      await interaction.reply({ embeds: [makeEmbed("📖 UNIQUE SPECIES LEADERBOARD", lines, COLORS.charcoal)] });
      return;
    }

    const rows = db.prepare(`
      SELECT user_id, SUM(count) AS score
      FROM user_creatures
      WHERE count > 0
      GROUP BY user_id
      ORDER BY score DESC
      LIMIT 10
    `).all();

    const lines = rows.length
      ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.score} creatures**`).join("\n")
      : "No creatures collected yet!";

    await interaction.reply({ embeds: [makeEmbed("🐉 TOTAL CREATURES CAUGHT LEADERBOARD", lines, COLORS.charcoal)] });
    return;
  }

  if (subcommand === "achievements") {
    const earned = new Set(
      db.prepare(`SELECT achievement_id FROM creature_achievements WHERE user_id = ?`)
        .all(userId)
        .map(r => r.achievement_id)
    );

    const lines = CREATURE_ACHIEVEMENTS.map(([id, title, desc]) =>
      `${earned.has(id) ? "🏅" : "🔒"} **${title}** — ${desc}`
    ).join("\n");

    await interaction.reply({
      embeds: [
        makeEmbed(
          `🏆 ${interaction.user.username}'s Creature Achievements (${earned.size}/${CREATURE_ACHIEVEMENTS.length})`,
          lines,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (["setchannel", "start", "stop", "spawn"].includes(subcommand)) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Only members with Manage Server permission can manage creature spawns." });
      return;
    }

    if (subcommand === "setchannel") {
      const channel = interaction.options.getChannel("channel", true);
      if (!channel.isTextBased() || !channel.send) {
        await interaction.reply({ content: "Please choose a text channel." });
        return;
      }

      db.prepare(`
        INSERT INTO creature_spawn_channels (guild_id, channel_id, enabled, updated_at)
        VALUES (?, ?, 0, CURRENT_TIMESTAMP)
        ON CONFLICT(guild_id) DO UPDATE SET channel_id = excluded.channel_id, updated_at = CURRENT_TIMESTAMP
      `).run(guildId, channel.id);

      await interaction.reply({ content: `🌲 Creature spawn channel set to ${channel}. Use \`/creatures start\` when you're ready.` });
      return;
    }

    if (subcommand === "start") {
      const config = db.prepare(`SELECT channel_id FROM creature_spawn_channels WHERE guild_id = ?`).get(guildId);
      if (!config) {
        await interaction.reply({ content: "Set a spawn channel first with `/creatures setchannel`." });
        return;
      }

      db.prepare(`UPDATE creature_spawn_channels SET enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`).run(guildId);
      await interaction.reply({ content: "🦇 Automatic creature spawning is now active! First to type `catch` in chat wins." });
      await spawnCreature(client, guildId, config.channel_id);
      return;
    }

    if (subcommand === "stop") {
      db.prepare(`UPDATE creature_spawn_channels SET enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?`).run(guildId);
      await interaction.reply({ content: "🌙 Automatic creature spawning has been paused." });
      return;
    }

    if (subcommand === "spawn") {
      const config = db.prepare(`SELECT channel_id FROM creature_spawn_channels WHERE guild_id = ?`).get(guildId);
      if (!config) {
        await interaction.reply({ content: "Set a spawn channel first with `/creatures setchannel`." });
        return;
      }

      await interaction.deferReply();
      const spawned = await spawnCreature(client, guildId, config.channel_id);
      await interaction.editReply(
        spawned
          ? "✨ A wild creature trading card has spawned in the configured channel!"
          : "There is already an active creature, or the spawn channel is unavailable."
      );
    }
  }
}

module.exports = {
  trySpeedCatchInChat,
  restoreCreatureSpawns,
  handleCreatureCommand
};
