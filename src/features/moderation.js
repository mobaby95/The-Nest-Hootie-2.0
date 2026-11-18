const { PermissionFlagsBits } = require("discord.js");
const db = require("../../database");
const { COLORS } = require("../config/constants");
const { makeEmbed, randomItem } = require("../utils/embeds");
const {
  renderJailMugshot,
  renderNaughtyNestWelcome
} = require("../../graphicsRenderer");

const jailTimers = new Map();

const PUBLIC_JAIL_LINES = [
  "🚨 **BUSTED!** Hootie swooped down and hauled {target} straight to the Naughty Nest!",
  "🦉 **HOOT HOOT, IT'S THE COOP!** {target} got tossed into Nest Jail for {minutes} minute(s)!",
  "🪶 **RUFFLED FEATHERS!** {target} has been escorted to the Naughty Nest to cool their wings!",
  "🔒 **LOCKED IN THE COOP!** {target} is serving {minutes} minute(s) in the Naughty Nest!"
];

function jailRoleId() {
  return (process.env.JAILBIRD_ROLE_ID || "").trim();
}

function jailChannelId() {
  return (process.env.JAIL_CHANNEL_ID || "").trim();
}

function scheduleJailRelease(client, guildId, userId, releaseAtIso) {
  const key = `${guildId}:${userId}`;
  if (jailTimers.has(key)) {
    clearTimeout(jailTimers.get(key));
    jailTimers.delete(key);
  }

  const delay = Math.max(0, new Date(releaseAtIso).getTime() - Date.now());
  console.log(`⏳ Scheduled Nest Jail release for ${userId} in ${Math.round(delay / 1000)}s`);

  const timer = setTimeout(async () => {
    jailTimers.delete(key);
    try {
      const guild =
        client.guilds.cache.get(guildId) ||
        (await client.guilds.fetch(guildId).catch(() => null));
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

  const sentence = db
    .prepare(`SELECT * FROM jail_sentences WHERE user_id = ? AND guild_id = ?`)
    .get(userId, guild.id);

  const roleId = jailRoleId();
  const member = await guild.members
    .fetch({ user: userId, force: true })
    .catch(() => null);
  const hadRole = Boolean(member && roleId && member.roles.cache.has(roleId));

  if (!sentence && !hadRole) {
    db.prepare(`DELETE FROM jail_sentences WHERE user_id = ?`).run(userId);
    return false;
  }

  if (member && roleId) {
    try {
      await member.roles.remove(roleId, "Released from Nest Jail");
      console.log(`🔓 Removed Jailbird role from ${userId} in ${guild.name}`);
    } catch (error) {
      console.error(`Could not remove Jailbird role from ${userId}:`, error);
      return false;
    }
  }

  db.prepare(`DELETE FROM jail_sentences WHERE user_id = ?`).run(userId);

  if (announce && member) {
    const releaseEmbed = makeEmbed(
      "🕊️ FREE BIRD!",
      `${member} has served their time in the Naughty Nest and is free to roam the rafters again!`,
      COLORS.silver
    );

    const jChanId = jailChannelId();
    const channel =
      (jChanId &&
        (guild.channels.cache.get(jChanId) ||
          (await guild.channels.fetch(jChanId).catch(() => null)))) ||
      guild.systemChannel;

    if (channel && channel.isTextBased()) {
      await channel.send({ content: `${member}`, embeds: [releaseEmbed] }).catch(err => {
        console.error("Could not send release message:", err);
      });
    }
  }

  return true;
}

async function checkJailSentences(client) {
  const nowIso = new Date().toISOString();

  const due = db
    .prepare(`SELECT * FROM jail_sentences WHERE release_at <= ?`)
    .all(nowIso);

  for (const sentence of due) {
    const guild =
      client.guilds.cache.get(sentence.guild_id) ||
      (await client.guilds.fetch(sentence.guild_id).catch(() => null));

    if (!guild) continue;
    await releaseJailedMember(guild, sentence.user_id, true);
  }

  const upcoming = db
    .prepare(`SELECT * FROM jail_sentences WHERE release_at > ?`)
    .all(nowIso);

  for (const sentence of upcoming) {
    const key = `${sentence.guild_id}:${sentence.user_id}`;
    if (!jailTimers.has(key)) {
      scheduleJailRelease(
        client,
        sentence.guild_id,
        sentence.user_id,
        sentence.release_at
      );
    }
  }
}

async function handleJailCommand(interaction, client) {
  if (
    !interaction.guild ||
    !interaction.memberPermissions?.has(PermissionFlagsBits.ModerateMembers)
  ) {
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
      await interaction.reply({
        content: "The JAILBIRD_ROLE_ID environment variable is missing in Railway."
      });
      return;
    }

    const targetUser = interaction.options.getUser("member", true);
    const minutes = interaction.options.getInteger("minutes", true);
    const reason =
      interaction.options.getString("reason") || "General owl mischief.";

    if (targetUser.id === interaction.user.id) {
      await interaction.reply({ content: "You cannot send yourself to Nest Jail." });
      return;
    }

    if (targetUser.id === client.user.id) {
      await interaction.reply({
        content: "Hootie cannot be jailed. Who would run the Nest?"
      });
      return;
    }

    const guild = interaction.guild;
    const target = await guild.members
      .fetch({ user: targetUser.id, force: true })
      .catch(() => null);
    const role =
      guild.roles.cache.get(roleId) ||
      (await guild.roles.fetch(roleId).catch(() => null));
    const botMember = await guild.members.fetchMe().catch(() => null);

    if (!target || !role || !botMember) {
      await interaction.reply({
        content: "I couldn't find the member, jail role, or bot permissions."
      });
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
      await interaction.reply({
        content: "My role must be higher than the member and the jail role."
      });
      return;
    }

    await interaction.deferReply();

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
    `).run(
      target.id,
      guild.id,
      interaction.user.id,
      reason,
      jailedAt.toISOString(),
      releaseAtIso
    );

    scheduleJailRelease(client, guild.id, target.id, releaseAtIso);

    const releaseUnix = Math.floor(releaseAt.getTime() / 1000);

    // 1. Funny public notice in the channel where /jail lock was run (e.g. #general)
    const mugshot = await renderJailMugshot({
      targetUser,
      moderatorUser: interaction.user,
      minutes,
      reason
    });

    const funnyLine = randomItem(PUBLIC_JAIL_LINES)
      .replace("{target}", `${target}`)
      .replace("{minutes}", String(minutes));

    const publicEmbed = makeEmbed(
      "🚨 OFF TO THE NAUGHTY NEST!",
      `${funnyLine}\n\n` +
        `**Offense:** ${reason}\n` +
        `**Parole Hearing:** <t:${releaseUnix}:R>`,
      COLORS.crimson
    ).setImage(`attachment://${mugshot.fileName}`);

    await interaction.editReply({
      embeds: [publicEmbed],
      files: [mugshot.attachment]
    });

    // 2. Silly "Welcome to the Naughty Nest" graphic inside JAIL_CHANNEL_ID
    const jChanId = jailChannelId();
    if (!jChanId) {
      await interaction.followUp({
        content: "⚠️ `JAIL_CHANNEL_ID` is not set in Railway variables, so I couldn't post the welcome graphic in Naughty Nest.",
        ephemeral: true
      });
      return;
    }

    const jailChan =
      guild.channels.cache.get(jChanId) ||
      (await guild.channels.fetch(jChanId).catch(() => null));

    if (!jailChan || !jailChan.isTextBased()) {
      await interaction.followUp({
        content: `⚠️ Could not find a text channel for \`JAIL_CHANNEL_ID\` (\`${jChanId}\`). Check that Hootie can view that channel.`,
        ephemeral: true
      });
      return;
    }

    const perms = jailChan.permissionsFor(botMember);
    const missing = ["ViewChannel", "SendMessages", "EmbedLinks", "AttachFiles"].filter(
      p => !perms?.has(PermissionFlagsBits[p])
    );

    if (missing.length) {
      await interaction.followUp({
        content: `⚠️ I'm missing permission(s) in <#${jailChan.id}>: **${missing.join(", ")}**. Grant those to Hootie's role in that channel!`,
        ephemeral: true
      });
      return;
    }

    try {
      const sillyWelcome = await renderNaughtyNestWelcome({
        targetUser,
        minutes,
        reason
      });

      const welcomeEmbed = makeEmbed(
        "🪶 WELCOME TO THE NAUGHTY NEST!",
        `Pull up a perch, ${target}! You're stuck in the coop for **${minutes} minute(s)**.\n\n` +
          `**Why you're here:** ${reason}\n` +
          `**Freedom unlocks:** <t:${releaseUnix}:R>`,
        COLORS.burgundy
      ).setImage(`attachment://${sillyWelcome.fileName}`);

      await jailChan.send({
        content: `${target}`,
        embeds: [welcomeEmbed],
        files: [sillyWelcome.attachment]
      });
    } catch (err) {
      console.error("Failed to send Naughty Nest welcome:", err);
      await interaction.followUp({
        content: `⚠️ Failed to post in <#${jailChan.id}>: \`${err.message}\``,
        ephemeral: true
      });
    }
    return;
  }

  if (subcommand === "release") {
    const target = interaction.options.getUser("member", true);
    const released = await releaseJailedMember(interaction.guild, target.id, true);

    await interaction.reply({
      content: released
        ? `🕊️ ${target} has been pardoned and released from the Naughty Nest.`
        : "That member does not have an active jail sentence or the Jailbird role, or my role is not high enough to remove it."
    });
    return;
  }

  if (subcommand === "status") {
    const sentences = db
      .prepare(
        `SELECT * FROM jail_sentences WHERE guild_id = ? ORDER BY release_at ASC`
      )
      .all(interaction.guildId);

    const lines = sentences.length
      ? sentences
          .map(s => {
            const unix = Math.floor(new Date(s.release_at).getTime() / 1000);
            return `🔒 <@${s.user_id}> — Releases <t:${unix}:R> • *Reason:* ${s.reason} *(by <@${s.moderator_id}>)*`;
          })
          .join("\n")
      : "No birdbrains are currently serving time in the Naughty Nest.";

    await interaction.reply({
      embeds: [makeEmbed("🔒 NAUGHTY NEST ROSTER", lines, COLORS.charcoal)]
    });
  }
}

module.exports = {
  checkJailSentences,
  handleJailCommand
};
