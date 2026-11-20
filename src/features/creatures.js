const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} = require("discord.js");
const db = require("../../database");
const { renderCreatureCard } = require("../../cardRenderer");
const { renderCreatureBinder } = require("../../graphicsRenderer");
const {
  COLORS,
  RARITY_SPAWN_WEIGHTS,
  CREATURE_ACHIEVEMENTS,
  SPAWN_MIN_MS,
  SPAWN_MAX_MS
} = require("../config/constants");
const { makeEmbed, localDate, getTimezone, randomItem } = require("../utils/embeds");
const { recordArcadeGame } = require("./arcade");

// 15-minute catch window
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const SHINY_WILD_CHANCE = 0.05; // 5% wild shiny rate
const SHINY_EGG_CHANCE = 0.15;  // 15% egg hatch shiny rate
const BINDER_PAGE_SIZE = 12;

let spawnTimer = null;

// ==========================================
// 🛍️ SHOP & EGG CONFIGURATIONS
// ==========================================

const SHOP_ITEMS = {
  lure: {
    id: "lure",
    name: "🌙 Moonlight Lure",
    price: 75,
    description: "Immediately summons a wild creature in the server's spawn channel."
  },
  treat: {
    id: "treat",
    name: "🍖 Hollow Catch Treat",
    price: 50,
    description: "Doubles Arcade Points earned from catching creatures for 1 hour."
  },
  accelerator: {
    id: "accelerator",
    name: "🔥 Ember Egg Accelerator",
    price: 60,
    description: "Adds +35 instant hatch steps to your active egg."
  },
  polish: {
    id: "polish",
    name: "✨ Prismatic Shiny Polish",
    price: 250,
    description: "Upgrades 1 standard creature in your binder into a Shiny foil card (`/creatures polish <name>`)."
  },
  moss_egg: {
    id: "moss_egg",
    name: "🥚 Mossy Hollow Egg",
    price: 45,
    description: "Hatches in 25 chat messages into a Common or Uncommon creature."
  },
  starlight_egg: {
    id: "starlight_egg",
    name: "🔮 Starlight Egg",
    price: 120,
    description: "Hatches in 60 chat messages into a guaranteed Rare or Ultra Rare creature."
  },
  royal_egg: {
    id: "royal_egg",
    name: "👑 Royal Sovereign Egg",
    price: 300,
    description: "Hatches in 120 chat messages into a Legendary or Mythic creature (Diva, Codee, Kiara, Kion, Pepper)!"
  }
};

const EGG_CONFIG = {
  moss_egg: {
    name: "Mossy Hollow Egg",
    steps: 25,
    rarities: ["Common", "Uncommon"]
  },
  starlight_egg: {
    name: "Starlight Egg",
    steps: 60,
    rarities: ["Rare", "Ultra Rare"]
  },
  royal_egg: {
    name: "Royal Sovereign Egg",
    steps: 120,
    rarities: ["Legendary", "Mythic"]
  }
};

// ==========================================
// 🐾 COMPANION BUFFS
// ==========================================

function getEquippedCompanion(userId) {
  return db.prepare(`
    SELECT ec.creature_id, ec.is_shiny, c.creature_name, c.creature_type, c.rarity
    FROM user_equipped_companion ec
    JOIN creature_catalog c ON c.creature_id = ec.creature_id
    WHERE ec.user_id = ?
  `).get(userId);
}

function describeCompanionPerk(companion) {
  if (!companion) return "None equipped";
  const shinyBonus = companion.is_shiny ? " *(+Shiny Boost)*" : "";
  if (companion.rarity === "Mythic") {
    return `👑 **Mythic Aura:** +${companion.is_shiny ? "20%" : "15%"} Arcade Points & +25% Egg Hatch Speed${shinyBonus}`;
  }
  switch (companion.creature_type) {
    case "Moon":
      return `🌙 **Lunar Stride:** +${companion.is_shiny ? "25%" : "15%"} faster Egg Hatching steps${shinyBonus}`;
    case "Shadow":
      return `🌑 **Shadow Stalker:** +25% bonus Arcade Points on fast catches (<3s)${shinyBonus}`;
    case "Fire":
    case "Starlight":
      return `🔥 **Radiant Spark:** +${companion.is_shiny ? "15%" : "10%"} Arcade Points on every catch${shinyBonus}`;
    default:
      return `🛡️ **Hollow Guardian:** 15% chance to find a free Egg Accelerator on catches${shinyBonus}`;
  }
}

// ==========================================
// 💳 CURRENCY HELPERS (ARCADE POINTS)
// ==========================================

function getUserPoints(userId) {
  return db.prepare(`SELECT points FROM arcade_points WHERE user_id = ?`).get(userId)?.points || 0;
}

function spendUserPoints(userId, amount, reason) {
  const current = getUserPoints(userId);
  if (current < amount) return false;
  db.prepare(`UPDATE arcade_points SET points = points - ? WHERE user_id = ?`).run(amount, userId);
  db.prepare(`INSERT INTO arcade_transactions (user_id, points, reason) VALUES (?, ?, ?)`).run(userId, -amount, reason);
  return true;
}

function hasActiveBuff(userId, buffId) {
  const row = db.prepare(`SELECT expires_at FROM user_active_buffs WHERE user_id = ? AND buff_id = ?`).get(userId, buffId);
  return row && new Date(row.expires_at).getTime() > Date.now();
}

// ==========================================
// 🏆 ACHIEVEMENTS & GRANTING
// ==========================================

function evaluateCreatureAchievements(userId, latestCatchMs = null, latestRarity = null) {
  const totals = db.prepare(`
    SELECT COALESCE(SUM(count), 0) AS total_cards,
           COALESCE(SUM(shiny_count), 0) AS total_shinies,
           COUNT(*) AS unique_species
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

function grantCreatureToUser(userId, creatureId, catchTimeMs = null, isShiny = false) {
  const shinyInc = isShiny ? 1 : 0;
  db.prepare(`
    INSERT INTO user_creatures (user_id, creature_id, count, shiny_count, fastest_catch_ms)
    VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(user_id, creature_id) DO UPDATE SET
      count = user_creatures.count + 1,
      shiny_count = user_creatures.shiny_count + excluded.shiny_count,
      fastest_catch_ms = CASE
        WHEN excluded.fastest_catch_ms IS NULL THEN user_creatures.fastest_catch_ms
        WHEN user_creatures.fastest_catch_ms IS NULL THEN excluded.fastest_catch_ms
        ELSE MIN(user_creatures.fastest_catch_ms, excluded.fastest_catch_ms)
      END
  `).run(userId, creatureId, shinyInc, catchTimeMs);

  return db.prepare(`
    SELECT count, shiny_count, fastest_catch_ms
    FROM user_creatures
    WHERE user_id = ? AND creature_id = ?
  `).get(userId, creatureId);
}

// ==========================================
// 🥚 EGG SYSTEM (CHAT & WELLNESS HATCHING)
// ==========================================

function createEggForUser(userId, eggTier) {
  const cfg = EGG_CONFIG[eggTier] || EGG_CONFIG.moss_egg;
  db.prepare(`
    INSERT INTO user_eggs (user_id, egg_tier, steps_current, steps_required)
    VALUES (?, ?, 0, ?)
  `).run(userId, eggTier, cfg.steps);
}

function advanceUserEggSteps(userId, stepIncrement = 1) {
  const egg = db.prepare(`
    SELECT * FROM user_eggs WHERE user_id = ? ORDER BY id ASC LIMIT 1
  `).get(userId);
  if (!egg) return null;

  const companion = getEquippedCompanion(userId);
  let multiplier = 1;
  if (companion?.rarity === "Mythic" || companion?.creature_type === "Moon") {
    multiplier = companion.is_shiny ? 1.35 : 1.25;
  }

  const gained = Math.max(1, Math.round(stepIncrement * multiplier));
  const nextSteps = egg.steps_current + gained;

  if (nextSteps < egg.steps_required) {
    db.prepare(`UPDATE user_eggs SET steps_current = ? WHERE id = ?`).run(nextSteps, egg.id);
    return null;
  }

  db.prepare(`DELETE FROM user_eggs WHERE id = ?`).run(egg.id);
  const cfg = EGG_CONFIG[egg.egg_tier] || EGG_CONFIG.moss_egg;
  const pool = db.prepare(`SELECT * FROM creature_catalog`).all()
    .filter(c => cfg.rarities.includes(c.rarity));

  const hatchedCreature = randomItem(pool.length ? pool : db.prepare(`SELECT * FROM creature_catalog`).all());
  const isShiny = Math.random() < SHINY_EGG_CHANCE;
  const record = grantCreatureToUser(userId, hatchedCreature.creature_id, null, isShiny);
  const achievements = evaluateCreatureAchievements(userId, null, hatchedCreature.rarity);

  return {
    eggName: cfg.name,
    creature: hatchedCreature,
    isShiny,
    record,
    achievements
  };
}

// ==========================================
// 🌲 SPAWN ENGINE (15-MINUTE LIFETIME)
// ==========================================

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
              embeds: [makeEmbed("🌙 CREATURE ESCAPED", `**${creatureName}** slipped back into the Hollow after 15 minutes.`, COLORS.charcoal)]
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

async function spawnCreature(client, guildId, channelId, forceSpawn = false) {
  const now = new Date();
  const active = db.prepare(`
    SELECT id FROM creature_spawns WHERE guild_id = ? AND status = 'active' AND expires_at > ? LIMIT 1
  `).get(guildId, now.toISOString());

  if (active && !forceSpawn) return false;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased() || !channel.send) {
    console.log(`Creature spawn channel unavailable for server ${guildId}`);
    return false;
  }

  const catalog = db.prepare(`SELECT * FROM creature_catalog`).all();
  if (!catalog.length) return false;

  const creature = selectWeightedCreature(catalog);
  const isShiny = Math.random() < SHINY_WILD_CHANCE;
  const expires = new Date(now.getTime() + FIFTEEN_MINUTES_MS);

  const result = db.prepare(`
    INSERT INTO creature_spawns (guild_id, channel_id, creature_id, is_shiny, status, spawned_at, expires_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?)
  `).run(guildId, channelId, creature.creature_id, isShiny ? 1 : 0, now.toISOString(), expires.toISOString());

  const spawnId = Number(result.lastInsertRowid);

  try {
    const card = await renderCreatureCard(creature, { mode: "spawn", isShiny });
    const titlePrefix = isShiny ? "✨ A SHINY WILD CREATURE HAS APPEARED!" : "🌲 A WILD CREATURE HAS APPEARED!";
    const shinyNotice = isShiny ? "\n🌟 **PRISMATIC FOIL VARIANT!**" : "";

    const embed = makeEmbed(
      titlePrefix,
      `A wild **${isShiny ? "Shiny " : ""}${creature.creature_name}** (*${creature.rarity} ${creature.creature_type}*) appeared in the Hollow!${shinyNotice}\n` +
      `Be the **first** to type **\`catch\`** in chat within **15 minutes** to claim this trading card!`,
      isShiny ? COLORS.gold || COLORS.crimson : COLORS.crimson
    ).setImage(`attachment://${card.fileName}`);

    const message = await channel.send({
      embeds: [embed],
      files: [card.attachment]
    });

    db.prepare(`UPDATE creature_spawns SET message_id = ? WHERE id = ?`).run(message.id, spawnId);
    expireCreatureSpawn(client, spawnId, channelId, message.id, `${isShiny ? "Shiny " : ""}${creature.creature_name}`, FIFTEEN_MINUTES_MS);
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

  // Advance egg hatch progress on chat activity (non-catch messages also count)
  const contentLower = (message.content || "").trim().toLowerCase();
  if (contentLower !== "catch") {
    const hatched = advanceUserEggSteps(message.author.id, 1);
    if (hatched) {
      const hatchCard = await renderCreatureCard(hatched.creature, {
        mode: "hatched",
        catcherName: message.author.username,
        ownedCount: hatched.record.count,
        shinyCount: hatched.record.shiny_count,
        isShiny: hatched.isShiny
      });
      await message.channel.send({
        content: `🥚✨ <@${message.author.id}>'s **${hatched.eggName}** hatched into a **${hatched.isShiny ? "SHINY " : ""}${hatched.creature.creature_name}** (*${hatched.creature.rarity}*)!`,
        files: [hatchCard.attachment]
      }).catch(() => {});
    }
    return false;
  }

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

    const isShiny = Boolean(spawn.is_shiny);
    const userRecord = grantCreatureToUser(message.author.id, spawn.creature_id, catchTimeMs, isShiny);

    // Calculate Arcade Points with Treat & Companion bonuses
    let pointsEarned = isShiny ? 25 : 10;
    if (hasActiveBuff(message.author.id, "treat")) pointsEarned *= 2;
    const companion = getEquippedCompanion(message.author.id);
    if (companion?.rarity === "Mythic") {
      pointsEarned = Math.round(pointsEarned * (companion.is_shiny ? 1.2 : 1.15));
    } else if (companion?.creature_type === "Fire" || companion?.creature_type === "Starlight") {
      pointsEarned = Math.round(pointsEarned * 1.1);
    } else if (companion?.creature_type === "Shadow" && catchTimeMs < 3000) {
      pointsEarned = Math.round(pointsEarned * 1.25);
    }

    let bonusLoot = null;
    if (companion && !["Mythic", "Moon", "Shadow", "Fire", "Starlight"].includes(companion.creature_type)) {
      if (Math.random() < 0.15) {
        db.prepare(`
          INSERT INTO user_items (user_id, item_id, quantity) VALUES (?, 'accelerator', 1)
          ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1
        `).run(message.author.id);
        bonusLoot = "🔥 +1 Ember Egg Accelerator *(Companion perk)*";
      }
    }

    recordArcadeGame(message.author.id, "creature_catch", pointsEarned, `Caught ${isShiny ? "Shiny " : ""}${spawn.creature_name}`);
    const achievements = evaluateCreatureAchievements(message.author.id, catchTimeMs, spawn.rarity);
    const hatched = advanceUserEggSteps(message.author.id, 5);

    return { spawn, isShiny, catchTimeMs, userRecord, pointsEarned, bonusLoot, achievements, hatched };
  })();

  if (!claimResult) return false;

  const { spawn, isShiny, catchTimeMs, userRecord, pointsEarned, bonusLoot, achievements, hatched } = claimResult;

  if (spawn.message_id) {
    const spawnMsg = await message.channel.messages.fetch(spawn.message_id).catch(() => null);
    if (spawnMsg) {
      await spawnMsg.edit({
        embeds: [
          makeEmbed(
            "✅ WILD CREATURE CLAIMED",
            `**${isShiny ? "✨ Shiny " : ""}${spawn.creature_name}** (*${spawn.rarity}*) was caught by ${message.author} in **${(catchTimeMs / 1000).toFixed(2)}s**!`,
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
    ownedCount: userRecord.count,
    shinyCount: userRecord.shiny_count,
    isShiny
  });

  let description =
    `🎉 **${message.author}** caught **${isShiny ? "✨ SHINY " : ""}${spawn.creature_name}** in **${(catchTimeMs / 1000).toFixed(2)}s**!\n` +
    `📦 Owned: **x${userRecord.count}** (✨ **${userRecord.shiny_count} Shiny**) • ✨ **+${pointsEarned} Arcade Points**`;

  if (bonusLoot) description += `\n🎁 **Bonus Drop:** ${bonusLoot}`;
  if (achievements.length) {
    description += `\n\n🏅 **Achievement Unlocked:** ${achievements.map(a => a.title).join(", ")}`;
  }
  if (hatched) {
    description += `\n🥚 **Egg Hatched!** Your **${hatched.eggName}** hatched into **${hatched.isShiny ? "✨ Shiny " : ""}${hatched.creature.creature_name}**!`;
  }

  const embed = makeEmbed(isShiny ? "✨ SHINY CREATURE CAUGHT!" : "✨ CREATURE CAUGHT!", description, COLORS.crimson)
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
    SELECT s.id, s.channel_id, s.message_id, s.expires_at, s.is_shiny, c.creature_name
    FROM creature_spawns s
    JOIN creature_catalog c ON c.creature_id = s.creature_id
    WHERE s.status = 'active' AND s.expires_at > ?
  `).all(now);

  for (const spawn of activeSpawns) {
    const remaining = new Date(spawn.expires_at).getTime() - Date.now();
    expireCreatureSpawn(
      client,
      spawn.id,
      spawn.channel_id,
      spawn.message_id,
      `${spawn.is_shiny ? "Shiny " : ""}${spawn.creature_name}`,
      remaining
    );
  }

  scheduleNextSpawn(client);
}

// ==========================================
// 📖 PAGINATED BINDER RENDERER HELPER
// ==========================================

async function buildBinderPagePayload(targetUser, pageIndex) {
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

  const totalPages = Math.max(1, Math.ceil(catalog.length / BINDER_PAGE_SIZE));
  const safePage = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const slice = catalog.slice(safePage * BINDER_PAGE_SIZE, (safePage + 1) * BINDER_PAGE_SIZE);

  const userRows = db.prepare(`
    SELECT creature_id, count, shiny_count, fastest_catch_ms
    FROM user_creatures
    WHERE user_id = ? AND count > 0
  `).all(targetUser.id);

  const ownedMap = new Map(userRows.map(r => [r.creature_id, r.count]));
  const shinyTotal = userRows.reduce((sum, r) => sum + (r.shiny_count || 0), 0);
  const companion = getEquippedCompanion(targetUser.id);

  const binder = await renderCreatureBinder({
    user: targetUser,
    catalog: slice,
    ownedMap,
    mode: "binder"
  });

  const summaryLines = slice.map(c => {
    const row = userRows.find(r => r.creature_id === c.creature_id);
    if (!row) return `⬛ **???** (*${c.rarity}*) — Uncaught`;
    const shinyBadge = row.shiny_count > 0 ? ` ✨x${row.shiny_count}` : "";
    const best = row.fastest_catch_ms ? ` • ⚡${(row.fastest_catch_ms / 1000).toFixed(2)}s` : "";
    const eq = companion?.creature_id === c.creature_id ? " 🐾" : "";
    return `✅ **${c.creature_name}** (*${c.rarity}*) — **x${row.count}**${shinyBadge}${best}${eq}`;
  }).join("\n");

  const embed = makeEmbed(
    `📖 ${targetUser.username}'s Hollow Binder (Page ${safePage + 1}/${totalPages})`,
    `**Discovered:** ${userRows.length}/${catalog.length} species • **Shiny Cards:** ✨ ${shinyTotal}\n` +
    `**Active Companion:** ${companion ? `${companion.is_shiny ? "✨ " : ""}${companion.creature_name}` : "None"}\n\n` +
    summaryLines,
    COLORS.burgundy
  ).setImage(`attachment://${binder.fileName}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`binder_prev_${safePage}`)
      .setLabel("◀ Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage === 0),
    new ButtonBuilder()
      .setCustomId(`binder_next_${safePage}`)
      .setLabel("Next ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1)
  );

  return {
    embeds: [embed],
    files: [binder.attachment],
    components: totalPages > 1 ? [row] : [],
    safePage,
    totalPages
  };
}

// ==========================================
// 🎮 SLASH COMMAND HANDLER
// ==========================================

async function handleCreatureCommand(interaction, client) {
  const subcommand = interaction.options.getSubcommand();
  const userId = interaction.user.id;
  const guildId = interaction.guildId;

  // 1. PAGINATED BINDER (MERGED CATALOG + INVENTORY)
  if (subcommand === "binder") {
    await interaction.deferReply();
    try {
      const targetUser = interaction.options.getUser("member") || interaction.user;
      let currentPage = 0;
      const initial = await buildBinderPagePayload(targetUser, currentPage);

      const replyMsg = await interaction.editReply({
        embeds: initial.embeds,
        files: initial.files,
        components: initial.components
      });

      if (initial.totalPages <= 1) return;

      const collector = replyMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 3 * 60 * 1000
      });

      collector.on("collect", async btn => {
        if (btn.user.id !== interaction.user.id) {
          await btn.reply({ content: "Run `/creatures binder` yourself to flip pages!", ephemeral: true });
          return;
        }
        await btn.deferUpdate();
        if (btn.customId.startsWith("binder_prev")) currentPage = Math.max(0, currentPage - 1);
        if (btn.customId.startsWith("binder_next")) currentPage += 1;

        const nextPayload = await buildBinderPagePayload(targetUser, currentPage);
        currentPage = nextPayload.safePage;
        await interaction.editReply({
          embeds: nextPayload.embeds,
          files: nextPayload.files,
          components: nextPayload.components
        });
      });

      collector.on("end", () => {
        interaction.editReply({ components: [] }).catch(() => {});
      });
    } catch (err) {
      console.error("Creature binder error:", err);
      await interaction.editReply({ content: "⚠️ Failed to render the creature binder." });
    }
    return;
  }

  // 2. PROFILE CARD VIEWER (SUPPORTS SHINY TOGGLE)
  if (subcommand === "profile") {
    const query = interaction.options.getString("creature", true).trim();
    const showShiny = interaction.options.getBoolean("shiny") || false;

    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "That creature isn't in the Hollow catalog." });
      return;
    }

    await interaction.deferReply();

    const owned = db.prepare(`
      SELECT count, shiny_count, fastest_catch_ms FROM user_creatures WHERE user_id = ? AND creature_id = ?
    `).get(userId, creature.creature_id) || { count: 0, shiny_count: 0, fastest_catch_ms: null };

    const renderAsShiny = showShiny || (owned.shiny_count > 0 && owned.count === owned.shiny_count);

    const card = await renderCreatureCard(creature, {
      mode: "profile",
      ownedCount: owned.count,
      shinyCount: owned.shiny_count,
      fastestMs: owned.fastest_catch_ms,
      isShiny: renderAsShiny
    });

    const embed = makeEmbed(
      `🃏 ${renderAsShiny ? "✨ Shiny " : ""}${creature.creature_name} — Trading Card`,
      `**Rarity:** ${creature.rarity} • **Type:** ${creature.creature_type}\n` +
      `**Owned by ${interaction.user.username}:** x${owned.count} (✨ ${owned.shiny_count} Shiny)`,
      COLORS.charcoal
    ).setImage(`attachment://${card.fileName}`);

    await interaction.editReply({ embeds: [embed], files: [card.attachment] });
    return;
  }

  // 3. PLAYER-TO-PLAYER TRADING
  if (subcommand === "trade") {
    const partner = interaction.options.getUser("member", true);
    const offerQuery = interaction.options.getString("offer", true).trim();
    const requestQuery = interaction.options.getString("request", true).trim();
    const offerShiny = interaction.options.getBoolean("offer_shiny") || false;
    const requestShiny = interaction.options.getBoolean("request_shiny") || false;

    if (partner.bot || partner.id === userId) {
      await interaction.reply({ content: "Choose another server member to trade with." });
      return;
    }

    const offerCreature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(offerQuery, offerQuery);

    const requestCreature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(requestQuery, requestQuery);

    if (!offerCreature || !requestCreature) {
      await interaction.reply({ content: "One or both creature names weren't found in the Hollow catalog." });
      return;
    }

    const senderRow = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, offerCreature.creature_id);
    const partnerRow = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(partner.id, requestCreature.creature_id);

    const hasSenderCard = offerShiny
      ? (senderRow?.shiny_count || 0) >= 1
      : ((senderRow?.count || 0) - (senderRow?.shiny_count || 0)) >= 1;

    const hasPartnerCard = requestShiny
      ? (partnerRow?.shiny_count || 0) >= 1
      : ((partnerRow?.count || 0) - (partnerRow?.shiny_count || 0)) >= 1;

    if (!hasSenderCard) {
      await interaction.reply({
        content: `You don't have a ${offerShiny ? "✨ Shiny " : "standard "}**${offerCreature.creature_name}** available to trade!`
      });
      return;
    }

    if (!hasPartnerCard) {
      await interaction.reply({
        content: `**${partner.username}** doesn't have a ${requestShiny ? "✨ Shiny " : "standard "}**${requestCreature.creature_name}** available to trade!`
      });
      return;
    }

    const offerLabel = `${offerShiny ? "✨ SHINY " : ""}${offerCreature.creature_name} (${offerCreature.rarity})`;
    const requestLabel = `${requestShiny ? "✨ SHINY " : ""}${requestCreature.creature_name} (${requestCreature.rarity})`;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("trade_accept").setLabel("✅ Accept Trade").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("trade_decline").setLabel("❌ Decline").setStyle(ButtonStyle.Danger)
    );

    const tradeMsg = await interaction.reply({
      content: `<@${partner.id}>`,
      embeds: [
        makeEmbed(
          "🔄 HOLLOW CARD TRADE OFFER",
          `**<@${userId}> offers:** **1x ${offerLabel}**\n` +
          `**In exchange for <@${partner.id}>'s:** **1x ${requestLabel}**\n\n` +
          `*${partner.username} has 5 minutes to accept or decline.*`,
          COLORS.burgundy
        )
      ],
      components: [row],
      fetchReply: true
    });

    const collector = tradeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 5 * 60 * 1000
    });

    collector.on("collect", async btn => {
      if (btn.customId === "trade_decline") {
        if (btn.user.id !== partner.id && btn.user.id !== userId) {
          await btn.reply({ content: "Only the two traders can cancel this offer.", ephemeral: true });
          return;
        }
        collector.stop("declined");
        await btn.update({
          embeds: [makeEmbed("❌ TRADE CANCELLED", `Trade between <@${userId}> and <@${partner.id}> was declined.`, COLORS.charcoal)],
          components: []
        });
        return;
      }

      if (btn.user.id !== partner.id) {
        await btn.reply({ content: `Only <@${partner.id}> can accept this trade!`, ephemeral: true });
        return;
      }

      const swapResult = db.transaction(() => {
        const sCheck = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, offerCreature.creature_id);
        const pCheck = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(partner.id, requestCreature.creature_id);

        const sOk = offerShiny ? (sCheck?.shiny_count || 0) >= 1 : ((sCheck?.count || 0) - (sCheck?.shiny_count || 0)) >= 1;
        const pOk = requestShiny ? (pCheck?.shiny_count || 0) >= 1 : ((pCheck?.count || 0) - (pCheck?.shiny_count || 0)) >= 1;
        if (!sOk || !pOk) return false;

        // Deduct offered card from sender
        db.prepare(`
          UPDATE user_creatures
          SET count = count - 1,
              shiny_count = shiny_count - ?
          WHERE user_id = ? AND creature_id = ?
        `).run(offerShiny ? 1 : 0, userId, offerCreature.creature_id);

        // Deduct requested card from partner
        db.prepare(`
          UPDATE user_creatures
          SET count = count - 1,
              shiny_count = shiny_count - ?
          WHERE user_id = ? AND creature_id = ?
        `).run(requestShiny ? 1 : 0, partner.id, requestCreature.creature_id);

        // Grant swapped cards
        grantCreatureToUser(partner.id, offerCreature.creature_id, null, offerShiny);
        grantCreatureToUser(userId, requestCreature.creature_id, null, requestShiny);

        // Unequip companion if a trader just traded away their last copy
        const sAfter = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, offerCreature.creature_id);
        if (!sAfter || sAfter.count <= 0) {
          db.prepare(`DELETE FROM user_equipped_companion WHERE user_id = ? AND creature_id = ?`).run(userId, offerCreature.creature_id);
        }
        const pAfter = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(partner.id, requestCreature.creature_id);
        if (!pAfter || pAfter.count <= 0) {
          db.prepare(`DELETE FROM user_equipped_companion WHERE user_id = ? AND creature_id = ?`).run(partner.id, requestCreature.creature_id);
        }

        return true;
      })();

      collector.stop("completed");

      if (!swapResult) {
        await btn.update({
          embeds: [makeEmbed("⚠️ TRADE FAILED", "One of the cards is no longer available in inventory.", COLORS.charcoal)],
          components: []
        });
        return;
      }

      await btn.update({
        embeds: [
          makeEmbed(
            "🤝 TRADE COMPLETE!",
            `<@${userId}> received **1x ${requestLabel}**\n` +
            `<@${partner.id}> received **1x ${offerLabel}**`,
            COLORS.crimson
          )
        ],
        components: []
      });
    });

    collector.on("end", (_, reason) => {
      if (reason === "time") {
        tradeMsg.edit({
          embeds: [makeEmbed("⌛ TRADE EXPIRED", "The trade offer timed out after 5 minutes.", COLORS.charcoal)],
          components: []
        }).catch(() => {});
      }
    });
    return;
  }

  // 4. SHOP & BUYING
  if (subcommand === "shop") {
    const balance = getUserPoints(userId);
    const itemsList = Object.values(SHOP_ITEMS)
      .map(item => `**${item.name}** — **${item.price} Arcade Pts** (\`id: ${item.id}\`)\n↳ ${item.description}`)
      .join("\n\n");

    await interaction.reply({
      embeds: [
        makeEmbed(
          "🏪 THE HOLLOW NIGHT MARKET",
          `💰 **Your Arcade Balance:** **${balance} Points**\nUse \`/creatures buy item:<id>\` to purchase items or eggs!\n\n${itemsList}`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  if (subcommand === "buy") {
    const itemId = interaction.options.getString("item", true);
    const item = SHOP_ITEMS[itemId];
    if (!item) {
      await interaction.reply({ content: "Unknown shop item." });
      return;
    }

    if (!spendUserPoints(userId, item.price, `Bought ${item.name}`)) {
      await interaction.reply({
        content: `You need **${item.price} Arcade Points** to buy **${item.name}** (you currently have **${getUserPoints(userId)}**).`
      });
      return;
    }

    if (itemId === "lure") {
      const config = db.prepare(`SELECT channel_id FROM creature_spawn_channels WHERE guild_id = ?`).get(guildId);
      if (!config) {
        // Refund if no channel set
        recordArcadeGame(userId, "refund", item.price, "Moonlight Lure refund");
        await interaction.reply({ content: "No spawn channel is configured yet! Your points were refunded." });
        return;
      }
      await interaction.deferReply();
      await spawnCreature(client, guildId, config.channel_id, true);
      await interaction.editReply({
        content: `🌙 **${interaction.user.username}** lit a **Moonlight Lure**! A wild creature has been summoned in <#${config.channel_id}>!`
      });
      return;
    }

    if (itemId === "treat") {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      db.prepare(`
        INSERT INTO user_active_buffs (user_id, buff_id, expires_at) VALUES (?, 'treat', ?)
        ON CONFLICT(user_id, buff_id) DO UPDATE SET expires_at = excluded.expires_at
      `).run(userId, expiresAt);
      await interaction.reply({
        content: `🍖 **${interaction.user.username}** ate a **Hollow Catch Treat**! Double Arcade Points on creature catches for **1 hour**!`
      });
      return;
    }

    if (itemId === "accelerator") {
      const activeEgg = db.prepare(`SELECT id FROM user_eggs WHERE user_id = ? ORDER BY id ASC LIMIT 1`).get(userId);
      if (!activeEgg) {
        db.prepare(`
          INSERT INTO user_items (user_id, item_id, quantity) VALUES (?, 'accelerator', 1)
          ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1
        `).run(userId);
        await interaction.reply({
          content: "🔥 Purchased **1x Ember Egg Accelerator** and stored it in your bag (you don't have an active egg incubating right now)."
        });
        return;
      }

      await interaction.deferReply();
      const hatched = advanceUserEggSteps(userId, 35);
      if (hatched) {
        const card = await renderCreatureCard(hatched.creature, {
          mode: "hatched",
          catcherName: interaction.user.username,
          ownedCount: hatched.record.count,
          shinyCount: hatched.record.shiny_count,
          isShiny: hatched.isShiny
        });
        await interaction.editReply({
          content: `🔥🥚 The **Ember Egg Accelerator** instantly hatched your **${hatched.eggName}** into a **${hatched.isShiny ? "✨ SHINY " : ""}${hatched.creature.creature_name}**!`,
          files: [card.attachment]
        });
      } else {
        const updatedEgg = db.prepare(`SELECT steps_current, steps_required FROM user_eggs WHERE id = ?`).get(activeEgg.id);
        await interaction.editReply({
          content: `🔥 Added **+35 hatch steps** to your active egg! Progress: **${updatedEgg.steps_current}/${updatedEgg.steps_required} steps**.`
        });
      }
      return;
    }

    if (itemId === "polish") {
      db.prepare(`
        INSERT INTO user_items (user_id, item_id, quantity) VALUES (?, 'polish', 1)
        ON CONFLICT(user_id, item_id) DO UPDATE SET quantity = quantity + 1
      `).run(userId);
      await interaction.reply({
        content: "✨ Purchased **1x Prismatic Shiny Polish**! Use `/creatures polish creature:<name>` to upgrade any creature in your binder into a Shiny foil card."
      });
      return;
    }

    if (EGG_CONFIG[itemId]) {
      createEggForUser(userId, itemId);
      const cfg = EGG_CONFIG[itemId];
      await interaction.reply({
        content: `🥚 Purchased a **${cfg.name}**! Chat in the server or catch creatures to rack up **${cfg.steps} steps** and hatch it. Check progress anytime with \`/creatures eggs\`.`
      });
      return;
    }
  }

  // 5. POLISH A CREATURE INTO SHINY
  if (subcommand === "polish") {
    const query = interaction.options.getString("creature", true).trim();
    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "Creature not found in the catalog." });
      return;
    }

    const polishItem = db.prepare(`SELECT quantity FROM user_items WHERE user_id = ? AND item_id = 'polish'`).get(userId);
    if (!polishItem || polishItem.quantity < 1) {
      await interaction.reply({ content: "You don't have a **Prismatic Shiny Polish**! Buy one in `/creatures shop`." });
      return;
    }

    const owned = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
    if (!owned || (owned.count - owned.shiny_count) < 1) {
      await interaction.reply({ content: `You need at least 1 non-shiny **${creature.creature_name}** in your binder to polish!` });
      return;
    }

    await interaction.deferReply();

    db.transaction(() => {
      db.prepare(`UPDATE user_items SET quantity = quantity - 1 WHERE user_id = ? AND item_id = 'polish'`).run(userId);
      db.prepare(`UPDATE user_creatures SET shiny_count = shiny_count + 1 WHERE user_id = ? AND creature_id = ?`).run(userId, creature.creature_id);
    })();

    const updated = db.prepare(`SELECT count, shiny_count, fastest_catch_ms FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
    const card = await renderCreatureCard(creature, {
      mode: "profile",
      ownedCount: updated.count,
      shinyCount: updated.shiny_count,
      fastestMs: updated.fastest_catch_ms,
      isShiny: true
    });

    await interaction.editReply({
      embeds: [
        makeEmbed(
          "✨ PRISMATIC POLISH APPLIED!",
          `**${interaction.user.username}** polished **${creature.creature_name}** into a **✨ SHINY FOIL CARD**!`,
          COLORS.crimson
        ).setImage(`attachment://${card.fileName}`)
      ],
      files: [card.attachment]
    });
    return;
  }

  // 6. COMPANION EQUIP / UNEQUIP
  if (subcommand === "equip") {
    const query = interaction.options.getString("creature", true).trim();
    const preferShiny = interaction.options.getBoolean("shiny") || false;

    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "That creature isn't in the Hollow catalog." });
      return;
    }

    const owned = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
    if (!owned || owned.count < 1) {
      await interaction.reply({ content: `You haven't caught **${creature.creature_name}** yet!` });
      return;
    }

    const equipShiny = preferShiny && owned.shiny_count > 0 ? 1 : (owned.shiny_count === owned.count ? 1 : 0);

    db.prepare(`
      INSERT INTO user_equipped_companion (user_id, creature_id, is_shiny, equipped_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id) DO UPDATE SET
        creature_id = excluded.creature_id,
        is_shiny = excluded.is_shiny,
        equipped_at = CURRENT_TIMESTAMP
    `).run(userId, creature.creature_id, equipShiny);

    const comp = getEquippedCompanion(userId);
    await interaction.reply({
      embeds: [
        makeEmbed(
          "🐾 COMPANION EQUIPPED!",
          `**${equipShiny ? "✨ Shiny " : ""}${creature.creature_name}** (*${creature.rarity} ${creature.creature_type}*) is now following **${interaction.user.username}**!\n\n` +
          `**Active Perk:** ${describeCompanionPerk(comp)}`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  // 7. DUPLICATE FUSION -> FORGE EGGS
  if (subcommand === "fuse") {
    const query = interaction.options.getString("creature", true).trim();
    const creature = db.prepare(`
      SELECT * FROM creature_catalog WHERE lower(creature_name) = lower(?) OR lower(creature_id) = lower(?)
    `).get(query, query);

    if (!creature) {
      await interaction.reply({ content: "Creature not found in the catalog." });
      return;
    }

    const owned = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
    const standardCopies = (owned?.count || 0) - (owned?.shiny_count || 0);

    if (standardCopies < 5) {
      await interaction.reply({
        content: `You need **5 standard duplicates** of **${creature.creature_name}** to fuse an egg (you have **${standardCopies}** non-shiny copies; Shiny cards are protected from fusion).`
      });
      return;
    }

    let rewardTier = "starlight_egg";
    if (["Rare", "Ultra Rare", "Legendary", "Mythic"].includes(creature.rarity)) {
      rewardTier = "royal_egg";
    }

    db.transaction(() => {
      db.prepare(`UPDATE user_creatures SET count = count - 5 WHERE user_id = ? AND creature_id = ?`).run(userId, creature.creature_id);
      createEggForUser(userId, rewardTier);
    })();

    const eggCfg = EGG_CONFIG[rewardTier];
    await interaction.reply({
      embeds: [
        makeEmbed(
          "🔮 HOLLOW FUSION COMPLETE!",
          `You fused **5x ${creature.creature_name}** (*${creature.rarity}*) into a **${eggCfg.name}**!\n` +
          `🥚 Send **${eggCfg.steps} chat messages** (or catch creatures) to hatch it. Check progress with \`/creatures eggs\`.`,
          COLORS.crimson
        )
      ]
    });
    return;
  }

  // 8. EGG INCUBATOR VIEW
  if (subcommand === "eggs") {
    const eggs = db.prepare(`SELECT * FROM user_eggs WHERE user_id = ? ORDER BY id ASC`).all(userId);
    const accCount = db.prepare(`SELECT quantity FROM user_items WHERE user_id = ? AND item_id = 'accelerator'`).get(userId)?.quantity || 0;
    const polishCount = db.prepare(`SELECT quantity FROM user_items WHERE user_id = ? AND item_id = 'polish'`).get(userId)?.quantity || 0;

    const eggLines = eggs.length
      ? eggs.map((e, idx) => {
          const cfg = EGG_CONFIG[e.egg_tier] || EGG_CONFIG.moss_egg;
          const status = idx === 0 ? "🔥 **Incubating**" : "⏳ Queued";
          return `${status} — **${cfg.name}**: **${e.steps_current}/${e.steps_required} steps**`;
        }).join("\n")
      : "No eggs incubating! Buy eggs in `/creatures shop` or fuse 5 duplicates with `/creatures fuse`.";

    await interaction.reply({
      embeds: [
        makeEmbed(
          `🥚 ${interaction.user.username}'s Incubator & Bag`,
          `${eggLines}\n\n` +
          `**🎒 Bag Items:**\n` +
          `• 🔥 Ember Egg Accelerators: **x${accCount}**\n` +
          `• ✨ Prismatic Shiny Polish: **x${polishCount}**`,
          COLORS.charcoal
        )
      ]
    });
    return;
  }

  // 9. DAILY PACK
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
    const isShiny = Math.random() < SHINY_WILD_CHANCE;

    db.prepare(`
      INSERT INTO creature_daily_claims (user_id, last_claim_date)
      VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET last_claim_date = excluded.last_claim_date
    `).run(userId, today);

    const record = grantCreatureToUser(userId, creature.creature_id, null, isShiny);
    const achievements = evaluateCreatureAchievements(userId, null, creature.rarity);

    const card = await renderCreatureCard(creature, {
      mode: "profile",
      ownedCount: record.count,
      shinyCount: record.shiny_count,
      fastestMs: record.fastest_catch_ms,
      isShiny
    });

    let desc = `🎁 **${interaction.user.username}** opened their daily Hollow pack and pulled **${isShiny ? "✨ SHINY " : ""}${creature.creature_name}** (*${creature.rarity}*)!\n📦 Owned: **x${record.count}** (✨ ${record.shiny_count} Shiny)`;
    if (achievements.length) {
      desc += `\n🏅 **Achievement Unlocked:** ${achievements.map(a => a.title).join(", ")}`;
    }

    await interaction.editReply({
      embeds: [makeEmbed("🎁 DAILY HOLLOW CREATURE", desc, COLORS.crimson).setImage(`attachment://${card.fileName}`)],
      files: [card.attachment]
    });
    return;
  }

  // 10. GIFTING
  if (subcommand === "gift") {
    const recipient = interaction.options.getUser("member", true);
    const query = interaction.options.getString("creature", true).trim();
    const giftShiny = interaction.options.getBoolean("shiny") || false;

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
      const senderRow = db.prepare(`SELECT count, shiny_count FROM user_creatures WHERE user_id = ? AND creature_id = ?`).get(userId, creature.creature_id);
      const hasCard = giftShiny
        ? (senderRow?.shiny_count || 0) >= 1
        : ((senderRow?.count || 0) - (senderRow?.shiny_count || 0)) >= 1;

      if (!hasCard) return { ok: false };

      db.prepare(`
        UPDATE user_creatures
        SET count = count - 1,
            shiny_count = shiny_count - ?
        WHERE user_id = ? AND creature_id = ?
      `).run(giftShiny ? 1 : 0, userId, creature.creature_id);

      grantCreatureToUser(recipient.id, creature.creature_id, null, giftShiny);

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
      await interaction.reply({ content: `You don't have a ${giftShiny ? "✨ Shiny " : "standard "}**${creature.creature_name}** card in your inventory to gift!` });
      return;
    }

    await interaction.reply({
      embeds: [
        makeEmbed(
          "🎀 CREATURE GIFTED!",
          `🦉 <@${userId}> gifted **1x ${giftShiny ? "✨ SHINY " : ""}${creature.creature_name}** (*${creature.rarity}*) to <@${recipient.id}>!`,
          COLORS.burgundy
        )
      ]
    });
    return;
  }

  // 11. LEADERBOARDS
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
      const totalCatalog = db.prepare(`SELECT COUNT(*) AS cnt FROM creature_catalog`).get().cnt;
      const rows = db.prepare(`
        SELECT user_id, COUNT(*) AS score
        FROM user_creatures
        WHERE count > 0
        GROUP BY user_id
        ORDER BY score DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **${r.score}/${totalCatalog} species**`).join("\n")
        : "No creatures collected yet!";

      await interaction.reply({ embeds: [makeEmbed("📖 UNIQUE SPECIES LEADERBOARD", lines, COLORS.charcoal)] });
      return;
    }

    if (type === "shiny") {
      const rows = db.prepare(`
        SELECT user_id, SUM(shiny_count) AS score
        FROM user_creatures
        WHERE shiny_count > 0
        GROUP BY user_id
        ORDER BY score DESC
        LIMIT 10
      `).all();

      const lines = rows.length
        ? rows.map((r, i) => `**${i + 1}.** <@${r.user_id}> — **✨ ${r.score} Shiny cards**`).join("\n")
        : "No Shiny creatures discovered yet!";

      await interaction.reply({ embeds: [makeEmbed("✨ SHINY COLLECTORS LEADERBOARD", lines, COLORS.charcoal)] });
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

  // 12. ACHIEVEMENTS
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

  // 13. ADMIN SPAWN CONTROLS
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
      await interaction.reply({ content: "🦇 Automatic creature spawning is now active! First to type `catch` within 15 minutes wins." });
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
          ? "✨ A wild creature trading card has spawned in the configured channel (15-minute catch window)!"
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
