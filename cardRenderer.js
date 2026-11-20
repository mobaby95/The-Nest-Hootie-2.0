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

let CARD_FONT = "sans-serif";
if (fs.existsSync(ROBOTO_REGULAR)) {
  GlobalFonts.registerFromPath(ROBOTO_REGULAR, "Roboto");
  if (fs.existsSync(ROBOTO_BOLD)) {
    GlobalFonts.registerFromPath(ROBOTO_BOLD, "Roboto");
  }
  CARD_FONT = "Roboto";
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

async function renderCreatureCard(creature, options = {}) {
  const {
    mode = "spawn",
    catcherName = null,
    catchTimeMs = null,
    ownedCount = 0,
    shinyCount = 0,
    fastestMs = null,
    isShiny = false
  } = options;

  const width = 600;
  const height = 840;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const baseTheme = RARITY_THEMES[creature.rarity] || RARITY_THEMES.Common;
  const theme = isShiny
    ? {
        borderPrimary: "#F6E05E",
        borderSecondary: "#D69E2E",
        headerBg: "#2D2412",
        badgeBg: "#B7791F",
        accent: "#FEFCBF",
        stars: `✦ SHINY ${baseTheme.stars} ✦`,
        holo: true
      }
    : baseTheme;

  // Outer card frame gradient (Prismatic Gold for Shiny)
  const outerGrad = ctx.createLinearGradient(0, 0, width, height);
  if (isShiny) {
    outerGrad.addColorStop(0, "#F6E05E");
    outerGrad.addColorStop(0.25, "#F687B3");
    outerGrad.addColorStop(0.5, "#81E6D9");
    outerGrad.addColorStop(0.75, "#B794F4");
    outerGrad.addColorStop(1, "#F6E05E");
  } else {
    outerGrad.addColorStop(0, theme.borderPrimary);
    outerGrad.addColorStop(0.5, theme.borderSecondary);
    outerGrad.addColorStop(1, theme.borderPrimary);
  }

  roundRect(ctx, 0, 0, width, height, 32);
  ctx.fillStyle = outerGrad;
  ctx.fill();

  // Inner dark card body
  roundRect(ctx, 18, 18, width - 36, height - 36, 22);
  ctx.fillStyle = isShiny ? "#1A1722" : "#16141C";
  ctx.fill();

  // Holographic / Prismatic Shimmer
  if (theme.holo) {
    ctx.save();
    roundRect(ctx, 18, 18, width - 36, height - 36, 22);
    ctx.clip();
    const holoGrad = ctx.createLinearGradient(0, 0, width, height);
    if (isShiny) {
      holoGrad.addColorStop(0, "rgba(246, 224, 94, 0.16)");
      holoGrad.addColorStop(0.35, "rgba(246, 135, 179, 0.18)");
      holoGrad.addColorStop(0.65, "rgba(129, 230, 217, 0.18)");
      holoGrad.addColorStop(1, "rgba(246, 224, 94, 0.16)");
    } else {
      holoGrad.addColorStop(0, "rgba(255, 255, 255, 0.02)");
      holoGrad.addColorStop(0.35, "rgba(246, 135, 179, 0.12)");
      holoGrad.addColorStop(0.65, "rgba(129, 230, 217, 0.12)");
      holoGrad.addColorStop(1, "rgba(236, 201, 75, 0.06)");
    }
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
  ctx.fillStyle = isShiny ? "#FEFCBF" : "#FFFFFF";
  ctx.font = `bold 28px ${CARD_FONT}`;
  ctx.textBaseline = "middle";
  const displayName = isShiny ? `✨ ${creature.creature_name}` : creature.creature_name;
  ctx.fillText(displayName, 52, 68);

  // Type Pill on Right of Header
  const typeLabel = `${creature.creature_type.toUpperCase()}`;
  ctx.font = `bold 16px ${CARD_FONT}`;
  const pillW = Math.max(ctx.measureText(typeLabel).width + 32, 80);
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

    // Golden sparkle wash over Shiny portrait
    if (isShiny) {
      const shineGrad = ctx.createLinearGradient(artX, artY, artX + artW, artY + artH);
      shineGrad.addColorStop(0, "rgba(255, 248, 180, 0.14)");
      shineGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.0)");
      shineGrad.addColorStop(1, "rgba(246, 224, 94, 0.22)");
      ctx.fillStyle = shineGrad;
      ctx.fillRect(artX, artY, artW, artH);

      ctx.fillStyle = "rgba(254, 252, 191, 0.9)";
      ctx.font = `bold 28px ${CARD_FONT}`;
      ctx.fillText("✦", artX + 20, artY + 34);
      ctx.fillText("✦", artX + artW - 44, artY + artH - 24);
    }
  } else {
    ctx.fillStyle = "#24202E";
    ctx.fillRect(artX, artY, artW, artH);
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 24px ${CARD_FONT}`;
    ctx.textAlign = "center";
    ctx.fillText("ARTWORK PENDING", width / 2, artY + artH / 2);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Artwork Inner Border
  roundRect(ctx, artX, artY, artW, artH, 16);
  ctx.lineWidth = isShiny ? 4 : 3;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  // Rarity Ribbon Strip
  roundRect(ctx, 34, 552, width - 68, 42, 10);
  ctx.fillStyle = theme.headerBg;
  ctx.fill();

  ctx.fillStyle = theme.accent;
  ctx.font = `bold 17px ${CARD_FONT}`;
  ctx.fillText(`${creature.rarity.toUpperCase()}  •  ${theme.stars}`, 50, 573);

  ctx.textAlign = "right";
  ctx.fillStyle = isShiny ? "#F6E05E" : "#A0AEC0";
  ctx.font = `bold 15px ${CARD_FONT}`;
  ctx.fillText(isShiny ? "PRISMATIC EDITION" : "THE HOLLOW ARCHIVES", width - 50, 573);
  ctx.textAlign = "left";

  // Lore Description Box
  roundRect(ctx, 34, 608, width - 68, 118, 14);
  ctx.fillStyle = "#1E1B26";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isShiny ? "rgba(246, 224, 94, 0.35)" : "rgba(255,255,255,0.08)";
  ctx.stroke();

  ctx.fillStyle = "#E2E8F0";
  ctx.font = `19px ${CARD_FONT}`;
  const loreLines = wrapText(ctx, creature.description, width - 104).slice(0, 3);
  loreLines.forEach((line, idx) => {
    ctx.fillText(line, 52, 640 + idx * 28);
  });

  // Footer Action / Stamp Bar
  roundRect(ctx, 34, 740, width - 68, 64, 14);
  ctx.fillStyle = mode === "caught" || mode === "hatched" ? theme.badgeBg : theme.headerBg;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = theme.borderPrimary;
  ctx.stroke();

  ctx.textAlign = "center";
  if (mode === "spawn") {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold 22px ${CARD_FONT}`;
    ctx.fillText("FIRST TO TYPE  catch  IN CHAT CLAIMS IT!", width / 2, 772);
  } else if (mode === "caught" || mode === "hatched") {
    const actionLabel = mode === "hatched" ? "HATCHED BY" : "CAUGHT BY";
    const sec = catchTimeMs != null ? `  •  ${(catchTimeMs / 1000).toFixed(2)}s` : "";
    const shinyTag = shinyCount > 0 ? ` (✨${shinyCount})` : "";
    const stampText = `${actionLabel} ${(catcherName || "OWL").toUpperCase()}${sec}  •  OWNED: x${ownedCount}${shinyTag}`;
    let fontSize = 20;
    ctx.font = `bold ${fontSize}px ${CARD_FONT}`;
    while (ctx.measureText(stampText).width > width - 96 && fontSize > 13) {
      fontSize -= 1;
      ctx.font = `bold ${fontSize}px ${CARD_FONT}`;
    }
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(stampText, width / 2, 772);
  } else {
    const best = fastestMs != null ? `BEST: ${(fastestMs / 1000).toFixed(2)}s` : "UNCAUGHT";
    const shinyTag = shinyCount > 0 ? ` (✨${shinyCount})` : "";
    ctx.fillStyle = theme.accent;
    ctx.font = `bold 19px ${CARD_FONT}`;
    ctx.fillText(
      `OWNED: x${ownedCount}${shinyTag}   •   ${best}`,
      width / 2,
      772
    );
  }
  ctx.textAlign = "left";

  const fileName = `${isShiny ? "shiny-" : ""}${creature.creature_id}-card.png`;
  return {
    attachment: new AttachmentBuilder(canvas.toBuffer("image/png"), { name: fileName }),
    fileName
  };
}

module.exports = {
  renderCreatureCard,
  findCreatureAsset
};
