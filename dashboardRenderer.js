const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Register Roboto font from @fontsource/roboto for Linux/Railway
const ROBOTO_REGULAR = path.join(
  __dirname,
  "node_modules",
  "@fontsource",
  "roboto",
  "files",
  "roboto-latin-400-normal.woff2"
);
const ROBOTO_BOLD = path.join(
  __dirname,
  "node_modules",
  "@fontsource",
  "roboto",
  "files",
  "roboto-latin-700-normal.woff2"
);

let DASH_FONT = "sans-serif";
if (fs.existsSync(ROBOTO_REGULAR)) {
  GlobalFonts.registerFromPath(ROBOTO_REGULAR, "Roboto");
  if (fs.existsSync(ROBOTO_BOLD)) {
    GlobalFonts.registerFromPath(ROBOTO_BOLD, "Roboto");
  }
  DASH_FONT = "Roboto";
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawProgressBar(ctx, x, y, w, h, ratio, fillColor) {
  const clamped = Math.max(0, Math.min(1, ratio || 0));
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = "#2A2536";
  ctx.fill();

  if (clamped > 0) {
    const fillW = Math.max(h, w * clamped);
    roundRect(ctx, x, y, fillW, h, h / 2);
    ctx.fillStyle = fillColor;
    ctx.fill();
  }
}

async function drawHeader(ctx, width, user, title, badgeText, theme) {
  // Outer frame
  const outerGrad = ctx.createLinearGradient(0, 0, width, 460);
  outerGrad.addColorStop(0, theme.borderPrimary);
  outerGrad.addColorStop(0.5, theme.borderSecondary);
  outerGrad.addColorStop(1, theme.borderPrimary);

  roundRect(ctx, 0, 0, width, 460, 26);
  ctx.fillStyle = outerGrad;
  ctx.fill();

  // Dark inner canvas
  roundRect(ctx, 12, 12, width - 24, 436, 18);
  ctx.fillStyle = "#14121B";
  ctx.fill();

  // Header container
  roundRect(ctx, 28, 26, width - 56, 76, 14);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  // User avatar circle
  const avatarX = 44;
  const avatarY = 38;
  const avatarSize = 52;
  try {
    const avatarUrl = user.displayAvatarURL({ extension: "png", size: 128 });
    const avatarImg = await loadImage(avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore();
  } catch {
    ctx.fillStyle = theme.badgeBg;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Avatar ring
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  // Title & Username
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 24px ${DASH_FONT}`;
  ctx.fillText(title, 110, 54);

  ctx.fillStyle = theme.accent;
  ctx.font = `15px ${DASH_FONT}`;
  ctx.fillText(`@${user.username}`, 110, 80);

  // Right Rank/Status Pill
  ctx.font = `bold 15px ${DASH_FONT}`;
  const pillW = Math.max(ctx.measureText(badgeText).width + 32, 110);
  const pillX = width - 44 - pillW;
  roundRect(ctx, pillX, 46, pillW, 36, 18);
  ctx.fillStyle = theme.badgeBg;
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(badgeText, pillX + pillW / 2, 64);
  ctx.textAlign = "left";
}

// ==========================================
// 🦉 WELLNESS DASHBOARD IMAGE (800 x 460)
// ==========================================
async function renderWellnessDashboard(data) {
  const { user, stats, rank, next, tab, activities, badges, challenges } = data;
  const width = 800;
  const height = 460;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const theme = {
    borderPrimary: "#9F7AEA",
    borderSecondary: "#553C9A",
    headerBg: "#241B38",
    badgeBg: "#6B46C1",
    accent: "#D6BCFA"
  };

  await drawHeader(
    ctx,
    width,
    user,
    `${user.username}'s Nest Archives`,
    rank.name.toUpperCase(),
    theme
  );

  // XP Progress Banner (y: 116 -> 182)
  const points = stats.lifetime_points || 0;
  roundRect(ctx, 28, 116, width - 56, 68, 12);
  ctx.fillStyle = "#1D1929";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 17px ${DASH_FONT}`;
  ctx.fillText(`LIFETIME OWL XP: ${points.toLocaleString()}`, 46, 138);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = `bold 16px ${DASH_FONT}`;
  if (next) {
    ctx.fillText(`${(next.points - points).toLocaleString()} XP TO ${next.name.toUpperCase()}`, width - 46, 138);
  } else {
    ctx.fillText("MAX RANK ACHIEVED", width - 46, 138);
  }
  ctx.textAlign = "left";

  const xpRatio = next
    ? (points - rank.points) / Math.max(1, next.points - rank.points)
    : 1;
  drawProgressBar(ctx, 46, 156, width - 92, 14, xpRatio, "#9F7AEA");

  // Tab-specific main panel (y: 198 -> 394)
  if (tab === "overview") {
    const boxes = [
      { label: "CURRENT STREAK", value: `${stats.current_streak || 0} DAYS`, sub: "Consecutive check-ins" },
      { label: "LONGEST STREAK", value: `${stats.longest_streak || 0} DAYS`, sub: "Personal Nest record" },
      { label: "WEEKLY POINTS", value: `${stats.weekly_points || 0} PTS`, sub: "Current week total" },
      { label: "BADGES EARNED", value: `${badges.length}`, sub: "Unlocked milestones" }
    ];

    const boxW = (width - 72) / 2;
    const boxH = 90;
    boxes.forEach((b, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 28 + col * (boxW + 16);
      const by = 198 + row * (boxH + 14);

      roundRect(ctx, bx, by, boxW, boxH, 12);
      ctx.fillStyle = "#1D1929";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(159, 122, 234, 0.35)";
      ctx.stroke();

      ctx.fillStyle = "#A0AEC0";
      ctx.font = `bold 13px ${DASH_FONT}`;
      ctx.fillText(b.label, bx + 20, by + 24);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 26px ${DASH_FONT}`;
      ctx.fillText(b.value, bx + 20, by + 53);

      ctx.fillStyle = theme.accent;
      ctx.font = `13px ${DASH_FONT}`;
      ctx.fillText(b.sub, bx + 20, by + 76);
    });
  } else if (tab === "activities") {
    roundRect(ctx, 28, 198, width - 56, 194, 12);
    ctx.fillStyle = "#1D1929";
    ctx.fill();

    ctx.fillStyle = theme.accent;
    ctx.font = `bold 16px ${DASH_FONT}`;
    ctx.fillText("LOGGED WELLNESS ACTIVITIES", 48, 224);

    if (!activities.length) {
      ctx.fillStyle = "#CBD5E1";
      ctx.font = `18px ${DASH_FONT}`;
      ctx.fillText("No activities logged yet. Use /wellness commands to begin!", 48, 280);
    } else {
      activities.slice(0, 6).forEach((act, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const ax = 48 + col * 360;
        const ay = 262 + row * 42;

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold 17px ${DASH_FONT}`;
        ctx.fillText(`• ${act.activity_type.toUpperCase()}`, ax, ay);

        ctx.fillStyle = theme.accent;
        ctx.font = `16px ${DASH_FONT}`;
        ctx.fillText(`${act.n} ${act.n === 1 ? "log" : "logs"}`, ax + 180, ay);
      });
    }
  } else if (tab === "badges") {
    roundRect(ctx, 28, 198, width - 56, 194, 12);
    ctx.fillStyle = "#1D1929";
    ctx.fill();

    ctx.fillStyle = theme.accent;
    ctx.font = `bold 16px ${DASH_FONT}`;
    ctx.fillText(`EARNED NEST BADGES (${badges.length})`, 48, 224);

    if (!badges.length) {
      ctx.fillStyle = "#CBD5E1";
      ctx.font = `18px ${DASH_FONT}`;
      ctx.fillText("No badges unlocked yet. Every little step counts!", 48, 280);
    } else {
      badges.slice(0, 8).forEach((name, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const bx = 48 + col * 360;
        const by = 258 + row * 34;

        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold 16px ${DASH_FONT}`;
        ctx.fillText(`★  ${name}`, bx, by);
      });
    }
  } else if (tab === "challenges") {
    roundRect(ctx, 28, 198, width - 56, 194, 12);
    ctx.fillStyle = "#1D1929";
    ctx.fill();

    challenges.slice(0, 3).forEach((ch, idx) => {
      const cy = 222 + idx * 56;
      const done = ch.progress >= ch.target;

      ctx.fillStyle = done ? "#81E6D9" : "#FFFFFF";
      ctx.font = `bold 15px ${DASH_FONT}`;
      ctx.fillText(`${done ? "[DONE] " : ""}${ch.title}`, 48, cy);

      ctx.textAlign = "right";
      ctx.fillStyle = theme.accent;
      ctx.font = `bold 14px ${DASH_FONT}`;
      ctx.fillText(
        `${Math.min(ch.progress, ch.target)} / ${ch.target}  (+${ch.reward_points} PTS)`,
        width - 48,
        cy
      );
      ctx.textAlign = "left";

      drawProgressBar(
        ctx,
        48,
        cy + 14,
        width - 96,
        12,
        ch.progress / Math.max(1, ch.target),
        done ? "#38B2AC" : "#9F7AEA"
      );
    });
  }

  // Footer strip
  roundRect(ctx, 28, 404, width - 56, 32, 8);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();
  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 13px ${DASH_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(
    `VIEWING: ${tab.toUpperCase()}  •  USE THE BUTTONS BELOW TO SWITCH TABS`,
    width / 2,
    420
  );
  ctx.textAlign = "left";

  const fileName = `wellness-dashboard-${user.id}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 🦇 ARCADE DASHBOARD IMAGE (800 x 460)
// ==========================================
async function renderArcadeDashboard(data) {
  const { user, tab, totalPoints, overallRank, statsMap, leaderboardRows, myTabRank } = data;
  const width = 800;
  const height = 460;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const theme = {
    borderPrimary: "#38B2AC",
    borderSecondary: "#234E52",
    headerBg: "#1A2E35",
    badgeBg: "#2C7A7B",
    accent: "#81E6D9"
  };

  await drawHeader(
    ctx,
    width,
    user,
    `${user.username}'s Midnight Arcade`,
    `RANK ${overallRank}`,
    theme
  );

  // Summary Banner (y: 116 -> 174)
  roundRect(ctx, 28, 116, width - 56, 58, 12);
  ctx.fillStyle = "#182429";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(56, 178, 172, 0.35)";
  ctx.stroke();

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 19px ${DASH_FONT}`;
  ctx.fillText(`TOTAL ARCADE POINTS: ${totalPoints.toLocaleString()}`, 48, 145);

  ctx.textAlign = "right";
  ctx.fillStyle = theme.accent;
  ctx.font = `bold 16px ${DASH_FONT}`;
  ctx.fillText(`TAB: ${tab.toUpperCase()}  •  YOUR RANK: ${myTabRank}`, width - 48, 145);
  ctx.textAlign = "left";

  if (tab === "overview") {
    const games = [
      {
        title: "LAST LETTER",
        plays: `${statsMap.lastletter.plays} WORDS`,
        pts: `${statsMap.lastletter.pts} Arcade Points`
      },
      {
        title: "COMMUNITY MADLIBS",
        plays: `${statsMap.madlibs.plays} WORDS`,
        pts: `${statsMap.madlibs.pts} Arcade Points`
      },
      {
        title: "CONTINUE THE STORY",
        plays: `${statsMap.story.plays} LINES`,
        pts: `${statsMap.story.pts} Arcade Points`
      },
      {
        title: "WILD CREATURE CATCHES",
        plays: `${statsMap.creature_catch.plays} CATCHES`,
        pts: `${statsMap.creature_catch.pts} Arcade Points`
      }
    ];

    const boxW = (width - 72) / 2;
    const boxH = 94;
    games.forEach((g, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = 28 + col * (boxW + 16);
      const by = 188 + row * (boxH + 14);

      roundRect(ctx, bx, by, boxW, boxH, 12);
      ctx.fillStyle = "#182429";
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(56, 178, 172, 0.35)";
      ctx.stroke();

      ctx.fillStyle = "#A0AEC0";
      ctx.font = `bold 13px ${DASH_FONT}`;
      ctx.fillText(g.title, bx + 20, by + 24);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 26px ${DASH_FONT}`;
      ctx.fillText(g.plays, bx + 20, by + 55);

      ctx.fillStyle = theme.accent;
      ctx.font = `14px ${DASH_FONT}`;
      ctx.fillText(g.pts, bx + 20, by + 79);
    });
  } else {
    // Leaderboard view for overall / lastletter / madlibs / story
    roundRect(ctx, 28, 188, width - 56, 204, 12);
    ctx.fillStyle = "#182429";
    ctx.fill();

    if (!leaderboardRows.length) {
      ctx.fillStyle = "#CBD5E1";
      ctx.font = `18px ${DASH_FONT}`;
      ctx.fillText("No scores recorded in this category yet!", 48, 250);
    } else {
      leaderboardRows.slice(0, 6).forEach((row, idx) => {
        const ly = 216 + idx * 30;
        const isTarget = row.user_id === user.id;

        ctx.fillStyle = isTarget ? "#FAF089" : "#FFFFFF";
        ctx.font = `bold 16px ${DASH_FONT}`;
        ctx.fillText(`#${idx + 1}   ${row.displayName}`, 48, ly);

        ctx.textAlign = "right";
        ctx.fillStyle = isTarget ? "#FAF089" : theme.accent;
        ctx.font = `bold 16px ${DASH_FONT}`;
        ctx.fillText(row.statLabel, width - 48, ly);
        ctx.textAlign = "left";
      });
    }
  }

  // Footer strip
  roundRect(ctx, 28, 404, width - 56, 32, 8);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();
  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 13px ${DASH_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(
    "THE MIDNIGHT ARCADE  •  SWITCH LEADERBOARDS WITH THE BUTTONS BELOW",
    width / 2,
    420
  );
  ctx.textAlign = "left";

  const fileName = `arcade-dashboard-${user.id}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

module.exports = {
  renderWellnessDashboard,
  renderArcadeDashboard
};
