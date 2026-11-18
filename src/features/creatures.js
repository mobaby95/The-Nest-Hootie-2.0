const { PermissionFlagsBits } = require("discord.js");
const db = require("../../database");
const { renderCreatureCard } = require("../../cardRenderer");
const { renderCreatureBinder } = require("../../graphicsRenderer");
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
