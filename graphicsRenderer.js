const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

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

let GFX_FONT = "sans-serif";
if (fs.existsSync(ROBOTO_REGULAR)) {
  GlobalFonts.registerFromPath(ROBOTO_REGULAR, "Roboto");
  if (fs.existsSync(ROBOTO_BOLD)) {
    GlobalFonts.registerFromPath(ROBOTO_BOLD, "Roboto");
  }
  GFX_FONT = "Roboto";
}

const RARITY_ACCENTS = {
  Common: "#A0AEC0",
  Uncommon: "#48BB78",
  Rare: "#4299E1",
  "Ultra Rare": "#B794F4",
  Legendary: "#F6AD55",
  Mythic: "#F56565"
};

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

function findCreatureAsset(creatureId) {
  const folder = path.join(__dirname, "assets", "creatures");
  if (!fs.existsSync(folder)) return null;
  for (const ext of [".png", ".jpg", ".jpeg", ".webp"]) {
    const candidate = path.join(folder, `${creatureId}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function fetchImageSafe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return await loadImage(buf);
  } catch {
    clearTimeout(timer);
    return null;
  }
}

async function drawCircularAvatar(ctx, url, cx, cy, radius, ringColor = "#9F7AEA") {
  const img = await fetchImageSafe(url);
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = "#2D3748";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ringColor;
  ctx.stroke();
}

function drawFrame(ctx, width, height, c1, c2) {
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, c1);
  grad.addColorStop(0.5, c2);
  grad.addColorStop(1, c1);

  roundRect(ctx, 0, 0, width, height, 24);
  ctx.fillStyle = grad;
  ctx.fill();

  roundRect(ctx, 10, 10, width - 20, height - 20, 18);
  ctx.fillStyle = "#13111A";
  ctx.fill();
}

// ==========================================
// 1. CREATURE BINDER GRID (800 x 540)
// ==========================================
async function renderCreatureBinder({ user, catalog, ownedMap, mode = "catalog" }) {
  const width = 800;
  const height = 540;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#9F7AEA", "#4A2545");

  roundRect(ctx, 26, 24, width - 52, 68, 12);
  ctx.fillStyle = "#211930";
  ctx.fill();

  await drawCircularAvatar(
    ctx,
    user.displayAvatarURL({ extension: "png", size: 128 }),
    62,
    58,
    22,
    "#D6BCFA"
  );

  const uniqueCount = ownedMap.size;
  const totalCards = Array.from(ownedMap.values()).reduce((a, b) => a + b, 0);

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 22px ${GFX_FONT}`;
  ctx.fillText(
    mode === "inventory"
      ? `${user.username}'s Hollow Binder`
      : `${user.username}'s Creature Index`,
    98,
    48
  );

  ctx.fillStyle = "#D6BCFA";
  ctx.font = `14px ${GFX_FONT}`;
  ctx.fillText(
    `DISCOVERED: ${uniqueCount}/${catalog.length} SPECIES  •  TOTAL CARDS: ${totalCards}`,
    98,
    72
  );

  const pct = Math.round((uniqueCount / Math.max(1, catalog.length)) * 100);
  roundRect(ctx, width - 146, 40, 104, 36, 18);
  ctx.fillStyle = "#6B46C1";
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 15px ${GFX_FONT}`;
  ctx.textAlign = "center";
  ctx.fillText(`${pct}% FULL`, width - 94, 58);
  ctx.textAlign = "left";

  const cols = 4;
  const gap = 14;
  const cardW = (width - 52 - gap * (cols - 1)) / cols;
  const cardH = 126;

  for (let i = 0; i < Math.min(12, catalog.length); i++) {
    const creature = catalog[i];
    const count = ownedMap.get(creature.creature_id) || 0;
    const isOwned = count > 0;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 26 + col * (cardW + gap);
    const y = 108 + row * (cardH + gap);
    const accent = RARITY_ACCENTS[creature.rarity] || "#A0AEC0";

    roundRect(ctx, x, y, cardW, cardH, 10);
    ctx.fillStyle = isOwned ? "#1D192B" : "#16141E";
    ctx.fill();
    ctx.lineWidth = isOwned ? 2 : 1;
    ctx.strokeStyle = isOwned ? accent : "rgba(255,255,255,0.08)";
    ctx.stroke();

    if (isOwned) {
      const assetPath = findCreatureAsset(creature.creature_id);
      if (assetPath) {
        try {
          const img = await loadImage(assetPath);
          ctx.save();
          roundRect(ctx, x + 10, y + 10, 62, 62, 8);
          ctx.clip();
          ctx.drawImage(img, x + 10, y + 10, 62, 62);
          ctx.restore();
        } catch {
          // Ignore image read failure
        }
      }

      roundRect(ctx, x + cardW - 46, y + 10, 36, 22, 11);
      ctx.fillStyle = "#2D2442";
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 12px ${GFX_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText(`x${count}`, x + cardW - 28, y + 21);
      ctx.textAlign = "left";

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 14px ${GFX_FONT}`;
      ctx.fillText(creature.creature_name, x + 10, y + 90);

      ctx.fillStyle = accent;
      ctx.font = `bold 11px ${GFX_FONT}`;
      ctx.fillText(creature.rarity.toUpperCase(), x + 10, y + 110);
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.font = `bold 28px ${GFX_FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("?", x + cardW / 2, y + 52);

      ctx.fillStyle = "#718096";
      ctx.font = `bold 13px ${GFX_FONT}`;
      ctx.fillText("UNCAUGHT", x + cardW / 2, y + 92);

      ctx.fillStyle = accent;
      ctx.font = `11px ${GFX_FONT}`;
      ctx.fillText(creature.rarity.toUpperCase(), x + cardW / 2, y + 110);
      ctx.textAlign = "left";
    }
  }

  const fileName = `creature-binder-${user.id}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 2. SERVER LEADERBOARD PODIUM (800 x 520)
// ==========================================
async function renderLeaderboardPodium({ title, subtitle, entries }) {
  const width = 800;
  const height = 520;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#D69E2E", "#553C9A");

  roundRect(ctx, 26, 22, width - 52, 58, 12);
  ctx.fillStyle = "#1E1A2E";
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 21px ${GFX_FONT}`;
  ctx.fillText(title, 44, 51);

  ctx.textAlign = "right";
  ctx.fillStyle = "#F6E05E";
  ctx.font = `bold 14px ${GFX_FONT}`;
  ctx.fillText(subtitle, width - 44, 51);
  ctx.textAlign = "left";

  const podiumConfig = [
    { idx: 1, label: "#2 SILVER", color: "#CBD5E0", x: 26, y: 112, h: 146 },
    { idx: 0, label: "#1 GOLD", color: "#F6E05E", x: 282, y: 94, h: 164 },
    { idx: 2, label: "#3 BRONZE", color: "#ED8936", x: 538, y: 118, h: 140 }
  ];

  const cardW = 236;
  for (const pod of podiumConfig) {
    const entry = entries[pod.idx];
    roundRect(ctx, pod.x, pod.y, cardW, pod.h, 14);
    ctx.fillStyle = "#1D192B";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = pod.color;
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = pod.color;
    ctx.font = `bold 13px ${GFX_FONT}`;
    ctx.fillText(pod.label, pod.x + cardW / 2, pod.y + 20);

    if (entry) {
      await drawCircularAvatar(ctx, entry.avatarUrl, pod.x + cardW / 2, pod.y + 62, 26, pod.color);
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 16px ${GFX_FONT}`;
      ctx.fillText(entry.displayName.slice(0, 16), pod.x + cardW / 2, pod.y + 106);

      ctx.fillStyle = pod.color;
      ctx.font = `bold 14px ${GFX_FONT}`;
      ctx.fillText(entry.scoreLabel, pod.x + cardW / 2, pod.y + 128);
    } else {
      ctx.fillStyle = "#718096";
      ctx.font = `14px ${GFX_FONT}`;
      ctx.fillText("Unclaimed", pod.x + cardW / 2, pod.y + 84);
    }
    ctx.textAlign = "left";
  }

  roundRect(ctx, 26, 274, width - 52, 222, 12);
  ctx.fillStyle = "#181524";
  ctx.fill();

  const rest = entries.slice(3, 10);
  if (!rest.length && !entries.length) {
    ctx.fillStyle = "#A0AEC0";
    ctx.font = `16px ${GFX_FONT}`;
    ctx.fillText("No scores recorded yet. Be the first to climb the Nest!", 46, 330);
  } else {
    rest.forEach((row, i) => {
      const ry = 294 + i * 29;
      ctx.fillStyle = "#A0AEC0";
      ctx.font = `bold 14px ${GFX_FONT}`;
      ctx.fillText(`#${i + 4}`, 46, ry);

      ctx.fillStyle = "#FFFFFF";
      ctx.font = `bold 15px ${GFX_FONT}`;
      ctx.fillText(row.displayName, 92, ry);

      ctx.textAlign = "right";
      ctx.fillStyle = "#D6BCFA";
      ctx.font = `bold 15px ${GFX_FONT}`;
      ctx.fillText(row.scoreLabel, width - 46, ry);
      ctx.textAlign = "left";
    });
  }

  const fileName = `leaderboard-podium-${Date.now()}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 3. BADGE & CHALLENGE UNLOCK BANNER (800 x 200)
// ==========================================
async function renderMilestoneBanner({ user, badges = [], challenges = [] }) {
  const width = 800;
  const height = 200;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#F6AD55", "#805AD5");

  await drawCircularAvatar(
    ctx,
    user.displayAvatarURL({ extension: "png", size: 128 }),
    74,
    100,
    38,
    "#F6E05E"
  );

  ctx.textBaseline = "middle";
  ctx.fillStyle = "#F6E05E";
  ctx.font = `bold 14px ${GFX_FONT}`;
  ctx.fillText("NEST MILESTONE UNLOCKED!", 134, 46);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 24px ${GFX_FONT}`;
  ctx.fillText(user.username, 134, 76);

  const items = [
    ...badges.map(b => `BADGE EARNED: ${b.name}`),
    ...challenges.map(c => `CHALLENGE COMPLETED: ${c}`)
  ];

  items.slice(0, 2).forEach((line, idx) => {
    const by = 114 + idx * 34;
    roundRect(ctx, 134, by - 13, width - 166, 26, 8);
    ctx.fillStyle = "#261E38";
    ctx.fill();

    ctx.fillStyle = "#81E6D9";
    ctx.font = `bold 14px ${GFX_FONT}`;
    ctx.fillText(`★  ${line}`, 148, by);
  });

  const fileName = `milestone-${user.id}-${Date.now()}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 4. STORYBOOK / MADLIBS COVER BANNER (800 x 220)
// ==========================================
async function renderStorybookCover({ modeLabel, title, contributors = [] }) {
  const width = 800;
  const height = 220;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#C53030", "#2D3748");

  roundRect(ctx, 24, 22, width - 48, height - 44, 14);
  ctx.fillStyle = "#1E1722";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#E53E3E";
  ctx.stroke();

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";

  ctx.fillStyle = "#FEB2B2";
  ctx.font = `bold 13px ${GFX_FONT}`;
  ctx.fillText(modeLabel.toUpperCase(), width / 2, 48);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 26px ${GFX_FONT}`;
  ctx.fillText(title.slice(0, 44), width / 2, 84);

  const uniqueAvatars = contributors.slice(0, 8);
  if (uniqueAvatars.length) {
    const spacing = 46;
    const startX = width / 2 - ((uniqueAvatars.length - 1) * spacing) / 2;
    for (let i = 0; i < uniqueAvatars.length; i++) {
      await drawCircularAvatar(ctx, uniqueAvatars[i], startX + i * spacing, 138, 18, "#FEB2B2");
    }
  }

  ctx.fillStyle = "#CBD5E0";
  ctx.font = `13px ${GFX_FONT}`;
  ctx.fillText(`WRITTEN BY ${contributors.length} NIGHT OWL${contributors.length === 1 ? "" : "S"} IN THE NEST`, width / 2, 180);
  ctx.textAlign = "left";

  const fileName = `storybook-cover-${Date.now()}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 5A. PUBLIC JAIL MUGSHOT CARD (800 x 360)
// ==========================================
async function renderJailMugshot({ targetUser, moderatorUser, minutes, reason }) {
  const width = 800;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#E53E3E", "#1A202C");

  roundRect(ctx, 26, 24, width - 52, 54, 10);
  ctx.fillStyle = "#742A2A";
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 21px ${GFX_FONT}`;
  ctx.fillText("HOLLOW DETENTION  •  LOCKED IN THE COOP", 44, 51);

  ctx.textAlign = "right";
  ctx.fillStyle = "#FEB2B2";
  ctx.font = `bold 14px ${GFX_FONT}`;
  ctx.fillText(`CASE #${targetUser.id.slice(-5)}`, width - 44, 51);
  ctx.textAlign = "left";

  const mugX = 36;
  const mugY = 98;
  const mugSize = 210;
  roundRect(ctx, mugX, mugY, mugSize, mugSize, 12);
  ctx.fillStyle = "#2D3748";
  ctx.fill();

  const avatar = await fetchImageSafe(targetUser.displayAvatarURL({ extension: "png", size: 256 }));
  if (avatar) {
    ctx.save();
    roundRect(ctx, mugX, mugY, mugSize, mugSize, 12);
    ctx.clip();
    ctx.drawImage(avatar, mugX, mugY, mugSize, mugSize);

    ctx.fillStyle = "rgba(15, 15, 20, 0.78)";
    for (let bx = mugX + 26; bx < mugX + mugSize; bx += 38) {
      ctx.fillRect(bx, mugY, 10, mugSize);
    }
    ctx.restore();
  }

  ctx.lineWidth = 3;
  ctx.strokeStyle = "#E53E3E";
  roundRect(ctx, mugX, mugY, mugSize, mugSize, 12);
  ctx.stroke();

  const infoX = 270;
  roundRect(ctx, infoX, 98, width - infoX - 28, 210, 12);
  ctx.fillStyle = "#1C1926";
  ctx.fill();

  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 12px ${GFX_FONT}`;
  ctx.fillText("DETAINEE", infoX + 20, 122);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 24px ${GFX_FONT}`;
  ctx.fillText(targetUser.username, infoX + 20, 148);

  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 12px ${GFX_FONT}`;
  ctx.fillText("TIME OUT DURATION", infoX + 20, 182);
  ctx.fillStyle = "#FEB2B2";
  ctx.font = `bold 18px ${GFX_FONT}`;
  ctx.fillText(`${minutes} MINUTE${minutes === 1 ? "" : "S"}`, infoX + 20, 204);

  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 12px ${GFX_FONT}`;
  ctx.fillText("OFFENSE / REASON", infoX + 20, 238);
  ctx.fillStyle = "#EDF2F7";
  ctx.font = `15px ${GFX_FONT}`;
  ctx.fillText(reason.slice(0, 52), infoX + 20, 260);

  ctx.fillStyle = "#718096";
  ctx.font = `13px ${GFX_FONT}`;
  ctx.fillText(`ESCAPED FROM: ${moderatorUser.username.toUpperCase()}'S PATIENCE`, infoX + 20, 290);

  const fileName = `nest-jail-${targetUser.id}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

// ==========================================
// 5B. SILLY NAUGHTY NEST WELCOME GRAPHIC (800 x 360)
// ==========================================
async function renderNaughtyNestWelcome({ targetUser, minutes, reason }) {
  const width = 800;
  const height = 360;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  drawFrame(ctx, width, height, "#F6AD55", "#B83280");

  // Playful Party / Timeout Header
  roundRect(ctx, 26, 24, width - 52, 58, 12);
  ctx.fillStyle = "#321933";
  ctx.fill();
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillStyle = "#F6E05E";
  ctx.font = `bold 23px ${GFX_FONT}`;
  ctx.fillText("WELCOME TO THE NAUGHTY NEST!", width / 2, 53);
  ctx.textAlign = "left";

  // Silly Birdcage Avatar Frame on Left
  const cageX = 48;
  const cageY = 104;
  const cageW = 190;
  const cageH = 216;

  // Dome top of birdcage
  ctx.save();
  ctx.beginPath();
  ctx.arc(cageX + cageW / 2, cageY + 75, 75, Math.PI, 0);
  ctx.lineTo(cageX + cageW - 20, cageY + cageH - 12);
  ctx.lineTo(cageX + 20, cageY + cageH - 12);
  ctx.closePath();
  ctx.fillStyle = "#24182E";
  ctx.fill();
  ctx.clip();

  const avatar = await fetchImageSafe(targetUser.displayAvatarURL({ extension: "png", size: 256 }));
  if (avatar) {
    ctx.drawImage(avatar, cageX + 20, cageY + 12, cageW - 40, cageH - 24);
  }

  // Golden birdcage bars
  ctx.fillStyle = "rgba(246, 224, 94, 0.78)";
  for (let bx = cageX + 36; bx < cageX + cageW - 24; bx += 28) {
    ctx.fillRect(bx, cageY, 5, cageH);
  }
  ctx.fillRect(cageX + 20, cageY + 105, cageW - 40, 5);
  ctx.restore();

  // Cage outline & perch ring at top
  ctx.beginPath();
  ctx.arc(cageX + cageW / 2, cageY - 4, 10, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#F6E05E";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cageX + cageW / 2, cageY + 75, 75, Math.PI, 0);
  ctx.lineTo(cageX + cageW - 20, cageY + cageH - 12);
  ctx.lineTo(cageX + 20, cageY + cageH - 12);
  ctx.closePath();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "#F6E05E";
  ctx.stroke();

  // Silly Welcome Card on Right
  const boxX = 264;
  roundRect(ctx, boxX, 104, width - boxX - 28, 216, 14);
  ctx.fillStyle = "#20172B";
  ctx.fill();

  ctx.fillStyle = "#FBB6CE";
  ctx.font = `bold 13px ${GFX_FONT}`;
  ctx.fillText("NEWEST BIRDBRAIN IN RESIDENCE", boxX + 20, 128);

  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 24px ${GFX_FONT}`;
  ctx.fillText(targetUser.username, boxX + 20, 156);

  ctx.fillStyle = "#EDF2F7";
  ctx.font = `15px ${GFX_FONT}`;
  ctx.fillText("Grab a seed cup and think about what you did.", boxX + 20, 190);
  ctx.fillText("Hootie is watching from the rafters!", boxX + 20, 212);

  roundRect(ctx, boxX + 20, 236, width - boxX - 68, 66, 10);
  ctx.fillStyle = "#2D1E3D";
  ctx.fill();

  ctx.fillStyle = "#F6E05E";
  ctx.font = `bold 14px ${GFX_FONT}`;
  ctx.fillText(`SENTENCE: ${minutes} MINUTE${minutes === 1 ? "" : "S"} IN THE COOP`, boxX + 34, 258);

  ctx.fillStyle = "#CBD5E0";
  ctx.font = `13px ${GFX_FONT}`;
  ctx.fillText(`REASON: ${reason.slice(0, 48)}`, boxX + 34, 282);

  const fileName = `naughty-nest-welcome-${targetUser.id}.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

module.exports = {
  renderCreatureBinder,
  renderLeaderboardPodium,
  renderMilestoneBanner,
  renderStorybookCover,
  renderJailMugshot,
  renderNaughtyNestWelcome
};
