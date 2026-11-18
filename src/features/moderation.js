const { PermissionFlagsBits } = require("discord.js");
const db = require("../../database");
const { COLORS } = require("../config/constants");
const { makeEmbed } = require("../utils/embeds");

const jailTimers = new Map();

function jailRoleId() {
  return process.env.JAILBIRD_ROLE_ID;
}

function jailChannelId() {
  return process.env.JAIL_CHANNEL_ID;
}

function scheduleJailRelease(client, guildId, userId, releaseAtIso) {
  const key = `${guildId}:${userId}`;
  if (jailTimers.has(key)) {
    clearTimeout(jailTimers.get(key));
    jailTimers.delete(key);
  }

  const delay = Math.max(0, new Date(releaseAtIso).getTime() - Date.now());

  const timer = setTimeout(async () => {
    jailTimers.delete(key);
    try {
      const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (guild) {
        await releaseJailedMember(guild, userId, true);
      }
    } catch (error) {
      console.error(`Scheduled jail release failed for ${userId}:`, error);
    }
  }, delay);

  jailTimers.set(key, timer);
}

async function releaseJailedMember(guild, userId, announce = true) {
  const key = `${guild.id}:${userId}`;
  if (jailTimers.has(key)) {
    clearTimeout(jailTimers.get(key));
    jailTimers.delete(key);
  }

  const sentence = db.prepare(`
    SELECT * FROM jail_sentences WHERE user_id = ? AND guild_id = ?
  `).get(userId, guild.id);

  const roleId = jailRoleId();
  const member = await guild.members.fetch(userId).catch(() => null);
  const hadRole = Boolean(member && roleId && member.roles.cache.has(roleId));

  if (!sentence && !hadRole) return false;

  if (hadRole) {
    try {
      await member.roles.remove(roleId, "Released from Nest Jail");
    } catch (error) {
      console.error(`Could not remove Jailbird role from ${userId}:`, error);
      return false;
    }
  }

  db.prepare(`DELETE FROM jail_sentences WHERE user_id = ?`).run(userId);

  if (announce && member) {
    const releaseEmbed = makeEmbed(
      "🔓 RELEASED FROM NEST JAIL",
      `${member} has served their time and is free to return to The Nest!`,
      COLORS.silver
    );

    const jChanId = jailChannelId();
    const channel = (jChanId && (
      guild.channels.cache.get(jChanId) ||
      await guild.channels.fetch(jChanId).catch(() => null)
    )) || guild.systemChannel;

    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [releaseEmbed] }).catch(() => {});
    }
  }

  return true;
}

async function checkJailSentences(client) {
  const nowIso = new Date().toISOString();

  const due = db.prepare(`
    SELECT * FROM jail_sentences WHERE release_at <= ?
  `).all(nowIso);

  for (const sentence of due) {
    const guild = client.guilds.cache.get(sentence.guild_id)
      || await client.guilds.fetch(sentence.guild_id).catch(() => null);

    if (!guild) continue;
    await releaseJailedMember(guild, sentence.user_id, true);
  }

  const upcoming = db.prepare(`
    SELECT * FROM jail_sentences WHERE release_at > ?
  `).all(nowIso);

  for (const sentence of upcoming) {
    const key = `${sentence.guild_id}:${sentence.user_id}`;
    if (!jailTimers.has(key)) {
      scheduleJailRelease(client, sentence.guild_id, sentence.user_id, sentence.release_at);
    }
  }
}

async function handleJailCommand(interaction, client) {
  if (!interaction.guild || !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)) {
    await interaction.reply({
      content: "🔒 Only moderators and administrators can use Nest Jail.",
      ephemeral: true
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "lock") {
    const roleId = jailRoleId();
    if (!roleId) {
      await interaction.reply({ content: "The JAILBIRD_ROLE_ID environment variable is missing in Railway." });
      return;
    }

    const targetUser = interaction.options.getUser("member", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const reason = interaction.options.getString("reason") || "No reason provided.";

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "You cannot send yourself to Nest Jail." });
      return;
    }

    if (targetUser.id === client.user.id) {
      await interaction.reply({ content: "Hootie cannot be jailed. Who would run the Nest?" });
      return;
    }

    const guild = interaction.guild;
    const target = await guild.members.fetch(targetUser.id).catch(() => null);
    const role = guild.roles.cache.get(roleId);
    const botMember = await guild.members.fetchMe().catch(() => null);

    if (!target || !role || !botMember) {
      await interaction.reply({ content: "I couldn't find the member, jail role, or bot permissions." });
      return;
    }

    if (target.id === guild.ownerId) {
      await interaction.reply({ content: "The server owner cannot be jailed." });
      return;
    }

    if (
      target.roles.highest.position >= botMember.roles.highest.position ||
      role.position >= botMember.roles.highest.position
    ) {
      await interaction.reply({ content: "My role must be higher than the member and the jail role." });
      return;
    }

    const jailedAt = new Date();
    const releaseAt = new Date(jailedAt.getTime() + minutes * 60 * 1000);
    const releaseAtIso = releaseAt.toISOString();

    await target.roles.add(role, `Nest Jail: ${reason}`);

    db.prepare(`
      INSERT INTO jail_sentences (user_id, guild_id, moderator_id, reason, jailed_at, release_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        guild_id = excluded.guild_id,
        moderator_id = excluded.moderator_id,
        reason = excluded.reason,
        jailed_at = excluded.jailed_at,
        release_at = excluded.release_at
    `).run(target.id, guild.id, interaction.user.id, reason, jailedAt.toISOString(), releaseAtIso);

    scheduleJailRelease(client, guild.id, target.id, releaseAtIso);

    const jailEmbed = makeEmbed(
      "🔒 WELCOME TO NEST JAIL",
      `${target} has been sent to Nest Jail for **${minutes} minute(s)**.\n\n` +
      `**Reason:** ${reason}\n` +
      `**Release:** <t:${Math.floor(releaseAt.getTime() / 1000)}:R>`,
      COLORS.crimson
    );

    const jChanId = jailChannelId();
    if (jChanId) {
      const jailChan = guild.channels.cache.get(jChanId)
        || await guild.channels.fetch(jChanId).catch(() => null);

      if (jailChan && jailChan.isTextBased()) {
        await jailChan.send({ content: `${target}`, embeds: [jailEmbed] }).catch(() => {});
      }
    }

    await interaction.reply({ embeds: [jailEmbed] });
    return;
  }

  if (subcommand === "release") {
    const target = interaction.options.getUser("member", true);
    const released = await releaseJailedMember(interaction.guild, target.id, true);

    await interaction.reply({
      content: released
        ? `🔓 ${target} has been released from Nest Jail.`
        : "That member does not have an active jail sentence or the Jailbird role, or my role is not high enough to remove it."
    });
    return;
  }

  if (subcommand === "status") {
    const sentences = db.prepare(`
      SELECT * FROM jail_sentences WHERE guild_id = ? ORDER BY release_at ASC
    `).all(interaction.guildId);

    const lines = sentences.length
      ? sentences.map(s => {
          const unix = Math.floor(new Date(s.release_at).getTime() / 1000);
          return `🔒 <@${s.user_id}> — Releases <t:${unix}:R> • *Reason:* ${s.reason} *(by <@${s.moderator_id}>)*`;
        }).join("\n")
      : "No members are currently serving time in Nest Jail.";

    await interaction.reply({
      embeds: [makeEmbed("🔒 NEST JAIL ROSTER", lines, COLORS.charcoal)]
    });
  }
}

module.exports = {
  checkJailSentences,
  handleJailCommand
};
