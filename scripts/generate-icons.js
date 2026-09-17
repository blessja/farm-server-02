const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const OUT_DIR = path.join(__dirname, "..", "mobile", "assets");

const LOGO = `
  <defs>
    <linearGradient id="leafGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#a3e635" stop-opacity="1" />
      <stop offset="100%" stop-color="#65a30d" stop-opacity="1" />
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="95" fill="#1a5f4a" />
  <circle cx="100" cy="100" r="85" fill="none" stroke="#ffffff" stroke-width="8" />
  <path d="M 120 65 Q 95 50 75 65" fill="#ffffff" opacity="0.9" />
  <path d="M 135 85 L 135 130 Q 135 145 120 150" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" />
  <path d="M 120 150 Q 85 155 65 135" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" />
  <path d="M 65 135 L 65 75 Q 65 55 80 50" fill="none" stroke="#ffffff" stroke-width="12" stroke-linecap="round" />
  <path d="M 100 120 L 135 120" fill="none" stroke="#ffffff" stroke-width="10" stroke-linecap="round" />
  <g transform="translate(115, 85)">
    <path d="M 0 -15 Q 8 -8 12 0 Q 13 8 10 15 Q 0 12 -8 8 Q -12 2 -10 -8 Q -8 -12 0 -15" fill="url(#leafGradient)" stroke="#1a3a2a" stroke-width="1.5" />
    <path d="M 0 -15 Q 2 0 0 15" stroke="#1a3a2a" stroke-width="1" fill="none" />
    <path d="M -2 -8 L 6 -6" stroke="#1a3a2a" stroke-width="0.8" opacity="0.6" />
    <path d="M -6 0 L 8 3" stroke="#1a3a2a" stroke-width="0.8" opacity="0.6" />
    <path d="M -4 8 L 6 10" stroke="#1a3a2a" stroke-width="0.8" opacity="0.6" />
  </g>
  <path d="M 105 80 L 130 105" stroke="#a3e635" stroke-width="3" stroke-linecap="round" opacity="0.8" />
`;

function svgFor({ background, scale = 1 }) {
  const group =
    scale === 1
      ? LOGO
      : `<g transform="translate(100, 100) scale(${scale}) translate(-100, -100)">${LOGO}</g>`;
  const bg =
    background != null
      ? `<rect width="200" height="200" fill="${background}" />`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 200 200">
${bg}${group}
</svg>`;
}

const targets = [
  {
    file: "icon.png",
    background: "#1a5f4a",
    scale: 0.9,
  },
  {
    file: "adaptive-icon.png",
    background: null,
    scale: 0.658,
  },
  {
    file: "splash-icon.png",
    background: null,
    scale: 1,
  },
];

async function generate() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const target of targets) {
    const svg = Buffer.from(svgFor(target), "utf8");
    const png = path.join(OUT_DIR, target.file);
    await sharp(svg).png().toFile(png);
    const meta = await sharp(png).metadata();
    console.log(`${target.file} ${meta.width}x${meta.height} (${fs.statSync(png).size} bytes)`);
  }
}

generate().catch((err) => {
  console.error(err);
  process.exit(1);
});