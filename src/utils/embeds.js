const fs = require("fs");
const path = require("path");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const db = require("../../database");
const { COLORS, FOOTER, LEVELS } = require("../config/constants");

function makeEmbed(title, description, color = COLORS.burgundy) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description || "\u200b")
    .setFooter({ text: FOOTER })
    .setTimestamp();
}

function getLogoAttachment() {
  const logoPath = path.join(__dirname, "..", "..", "assets", "hootie-logo.jpg");
  if (!fs.existsSync(logoPath)) {
    return null;
  }
  return new AttachmentBuilder(logoPath, { name: "hootie-logo.jpg" });
}

function localDate(timeZone = "UTC", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function previousDate(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function weekStart(dateString) {
  const date = new Date(`${dateString}T12:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function ensureUser(userId) {
  db.prepare(`
    INSERT OR IGNORE INTO users (
      user_id,
      wellness_points,
      lifetime_points,
      weekly_points
    )
    VALUES (?, 0, 0, 0)
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO user_timezones (user_id)
    VALUES (?)
  `).run(userId);

  db.prepare(`
    INSERT OR IGNORE INTO arcade_points (user_id, points)
    VALUES (?, 0)
  `).run(userId);
}

function getTimezone(userId) {
  ensureUser(userId);

  return db.prepare(`
    SELECT timezone
    FROM user_timezones
    WHERE user_id = ?
  `).get(userId)?.timezone || "America/Los_Angeles";
}

function resetWeeklyPoints(userId, period) {
  ensureUser(userId);

  const row = db.prepare(`
    SELECT weekly_period
    FROM users
    WHERE user_id = ?
  `).get(userId);

  if (row.weekly_period !== period) {
    db.prepare(`
      UPDATE users
      SET weekly_points = 0,
          weekly_period = ?
      WHERE user_id = ?
    `).run(period, userId);
  }
}

function getLevel(points) {
  return [...LEVELS].reverse().find(level => points >= level.points) || LEVELS[0];
}

function nextLevel(points) {
  return LEVELS.find(level => level.points > points) || null;
}

function progressBar(current, target, size = 12) {
  if (!target || target <= 0) {
    return "▰".repeat(size);
  }
  const filled = Math.max(0, Math.min(size, Math.floor((current / target) * size)));
  return "▰".repeat(filled) + "▱".repeat(size - filled);
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function formatContributors(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (!uniqueIds.length) {
    return "No contributors recorded.";
  }
  return uniqueIds.map(id => `<@${id}>`).join(", ");
}

function splitTextChunks(text, maxLength = 3500) {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let sliceIndex = remaining.lastIndexOf("\n\n", maxLength);
    if (sliceIndex <= 0) sliceIndex = remaining.lastIndexOf("\n", maxLength);
    if (sliceIndex <= 0) sliceIndex = remaining.lastIndexOf(" ", maxLength);
    if (sliceIndex <= 0) sliceIndex = maxLength;

    chunks.push(remaining.slice(0, sliceIndex).trim());
    remaining = remaining.slice(sliceIndex).trim();
  }

  if (remaining.length) {
    chunks.push(remaining);
  }

  return chunks;
}

module.exports = {
  makeEmbed,
  getLogoAttachment,
  localDate,
  previousDate,
  weekStart,
  ensureUser,
  getTimezone,
  resetWeeklyPoints,
  getLevel,
  nextLevel,
  progressBar,
  randomItem,
  formatContributors,
  splitTextChunks
};
