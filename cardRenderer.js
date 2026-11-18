const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { AttachmentBuilder } = require("discord.js");
const fs = require("fs");
const path = require("path");

// Register bundled font for Linux/Railway environments
const FONT_PATH = path.join(__dirname, "assets", "fonts", "HootieFont.ttf");
let CARD_FONT = "sans-serif";
if (fs.existsSync(FONT_PATH)) {
  GlobalFonts.registerFromPath(FONT_PATH, "HootieFont");
  CARD_FONT = "HootieFont";
  console.log("✅ Registered HootieFont for trading cards");
} else {
  console.warn("⚠️ assets/fonts/HootieFont.ttf not found; card text may be blank on Linux.");
}

const RARITY_THEMES = {
  Common: {
    borderPrimary: "#8E9AAF",
    borderSecondary: "#4A5568",
    headerBg: "#252834",
    badgeBg: "#4A5568",
    accent: "#CBD5E1",
    stars: "★",
    holo: false
  },
  Uncommon: {
    borderPrimary: "#38B2AC",
    borderSecondary: "#234E52",
    headerBg: "#1D3238",
    badgeBg: "#2C7A7B",
    accent: "#81E6D9",
    stars: "★★",
    holo: false
  },
  Rare: {
    borderPrimary: "#E53E3E",
    borderSecondary: "#742A2A",
    headerBg: "#361B24",
    badgeBg: "#9B2C2C",
    accent: "#FEB2B2",
    stars: "★★★",
    holo: false
  },
  "Ultra Rare": {
    borderPrimary: "#9F7AEA",
    borderSecondary: "#44337A",
    headerBg: "#281E42",
    badgeBg: "#6B46C1",
    accent: "#D6BCFA",
    stars: "★★★★",
    holo: true
  },
  Legendary: {
    borderPrimary: "#ECC94B",
    borderSecondary: "#975A16",
    headerBg: "#382B16",
    badgeBg: "#B7791F",
    accent: "#FAF089",
    stars: "★★★★★",
    holo: true
  },
  Mythic: {
    borderPrimary: "#F687B3",
    borderSecondary: "#805AD5",
    headerBg: "#361933",
    badgeBg: "#B83280",
    accent: "#FBB6CE",
    stars: "✦ MYTHIC ✦",
    holo: true
  }
};

const TYPE_ICONS = {
  Shadow: "🌑",
  Fire: "🔥",
  Moon: "🌙",
  Nature: "🌿",
  Spirit: "👻",
  Starlight: "✨"
};

function findCreatureAsset(creatureId) {
  const dir = path.join(__dirname, "assets", "creatures");
  if (!fs.existsSync(dir)) return null;

  const target = creatureId.toLowerCase();
  const allowedExts = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const files = fs.readdirSync(dir);

  const match = files.find(file => {
    const parsed = path.parse(file);
    return (
      parsed.name.toLowerCase() === target &&
      allowedExts.has(parsed.ext.toLowerCase())
    );
  });

  return match ? path.join(dir, match) : null;
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

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Generates a 600x840 trading card PNG AttachmentBuilder.
 * mode: "spawn" | "caught" | "profile"
 */
async function renderCreatureCard(creature, options = {}) {
  const {
    mode = "spawn",
    catcherName = null,
    catchTimeMs = null,
    ownedCount = 0,
    fastestMs = null
  } = options;

  const width = 600;
  const height = 840;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const theme = RARITY_THEMES[creature.rarity] || RARITY_THEMES.Common;

  // Outer card frame gradient
  const outerGrad = ctx.createLinearGradient(0, 0, width, height);
  outerGrad.addColorStop(0, theme.borderPrimary);
  outerGrad.addColorStop(0.5, theme.borderSecondary);
  outerGrad.addColorStop(1, theme.borderPrimary);

  roundRect(ctx, 0, 0, width, height, 32);
  ctx.fillStyle = outerGrad;
  ctx.fill();

  // Inner dark card body
  roundRect(ctx, 18, 18, width - 36, height - 36, 22);
  ctx.fillStyle = "#16141C";
  ctx.fill();

  // Subtle holographic diagonal shimmer for Ultra Rare / Legendary / Mythic
  if (theme.holo) {
    ctx.save();
    roundRect(ctx, 18, 18, width - 36, height - 36, 22);
    ctx.clip();
    const holoGrad = ctx.createLinearGradient(0, 0, width, height);
    holoGrad.addColorStop(0, "rgba(255, 255, 255, 0.02)");
    holoGrad.addColorStop(0.35, "rgba(246, 135, 179, 0.12)");
    holoGrad.addColorStop(0.65, "rgba(129, 230, 217, 0.12)");
    holoGrad.addColorStop(1, "rgba(236, 201, 75, 0.06)");
    ctx.fillStyle = holoGrad;
    ctx.fillRect(18, 18, width - 36, height - 36);
    ctx.restore();
  }

  // Top Header Bar
  roundRect(ctx, 34, 34, width - 68, 68, 14);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  // Creature Name
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `bold 30px "${CARD_FONT}"`;
  ctx.textBaseline = "middle";
  ctx.fillText(creature.creature_name, 52, 68);

  // Type Pill on Right of Header
  const typeLabel = `${creature.creature_type.toUpperCase()}`;
  ctx.font = `bold 16px "${CARD_FONT}"`;
  const pillW = ctx.measureText(typeLabel).width + 32;
  const pillX = width - 50 - pillW;
  roundRect(ctx, pillX, 49, pillW, 38, 19);
  ctx.fillStyle = theme.badgeBg;
  ctx.fill();

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.fillText(typeLabel, pillX + pillW / 2, 68);
  ctx.textAlign = "left";

  // Artwork Frame (532 x 420)
  const artX = 34;
  const artY = 118;
  const artW = width - 68;
  const artH = 420;

  ctx.save();
  roundRect(ctx, artX, artY, artW, artH, 16);
  ctx.clip();

  const assetPath = findCreatureAsset(creature.creature_id);
  if (assetPath) {
    const img = await loadImage(assetPath);
    const scale = Math.max(artW / img.width, artH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const offsetX = artX + (artW - drawW) / 2;
    const offsetY = artY + (artH - drawH) / 2;
    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  } else {
    ctx.fillStyle = "#24202E";
    ctx.fillRect(artX, artY, artW, artH);
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 24px "${CARD_FONT}"`;
    ctx.textAlign = "center";
    ctx.fillText("ARTWORK PENDING", width / 2, artY + artH / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Artwork Gold/Rarity Inner Border
  roundRect(ctx, artX, artY, artW, artH, 16);
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  // Rarity Ribbon Strip below Artwork
  roundRect(ctx, 34, 552, width - 68, 42, 10);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();

  ctx.fillStyle = theme.accent;
  ctx.font = `bold 18px "${CARD_FONT}"`;
  ctx.fillText(`${creature.rarity.toUpperCase()}  •  ${theme.stars}`, 50, 573);

  ctx.textAlign = "right";
  ctx.fillStyle = "#A0AEC0";
  ctx.font = `bold 15px "${CARD_FONT}"`;
  ctx.fillText("THE HOLLOW ARCHIVES", width - 50, 573);
  ctx.textAlign = "left";

  // Lore Description Box
  roundRect(ctx, 34, 608, width - 68, 118, 14);
  ctx.fillStyle = "#1E1B26";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.fillStyle = "#E2E8F0";
  ctx.font = `19px "${CARD_FONT}"`;
  const loreLines = wrapText(ctx, creature.description, width - 104).slice(0, 3);
  loreLines.forEach((line, idx) => {
    ctx.fillText(line, 52, 640 + idx * 28);
  });

  // Footer Action / Stamp Bar
  roundRect(ctx, 34, 740, width - 68, 64, 14);
  ctx.fillStyle = mode === "caught" ? theme.badgeBg : theme.headerBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  ctx.textAlign = "center";
  if (mode === "spawn") {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 22px "${CARD_FONT}"`;
    ctx.fillText("⚡ FIRST TO TYPE  catch  IN CHAT CLAIMS IT!", width / 2, 772);
  } else if (mode === "caught") {
    const sec = catchTimeMs != null ? `${(catchTimeMs / 1000).toFixed(2)}s` : "";
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 20px "${CARD_FONT}"`;
    ctx.fillText(
      `CAUGHT BY ${(catcherName || "OWL").toUpperCase()}  •  ${sec}  •  OWNED: x${ownedCount}`,
      width / 2,
      772
    );
  } else {
    const best = fastestMs != null ? `BEST: ${(fastestMs / 1000).toFixed(2)}s` : "UNCAUGHT";
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 20px "${CARD_FONT}"`;
    ctx.fillText(
      `OWNED: x${ownedCount}   •   ${best}`,
      width / 2,
      772
    );
  }
  ctx.textAlign = "left";

  const fileName = `${creature.creature_id}-card.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

module.exports = {
  renderCreatureCard,
  findCreatureAsset
};
