// Generates the PWA / home-screen icons: 語 in white on sumi ink (--primary).
// The glyph is taken from the bundled Noto Sans JP as an outline path, so the
// result doesn't depend on whatever fonts the machine has. Rasterised with
// sharp (installed with Next). Re-run after changing the design:
//   node scripts/generate-icons.mjs
import { readFileSync } from "node:fs";
import fontkit from "@pdf-lib/fontkit";
import sharp from "sharp";

const INK = "#3a3835";
const PAPER = "#ffffff";
const GLYPH = "語";

const font = fontkit.create(readFileSync("public/fonts/NotoSansJP-Regular.ttf"));
const glyph = font.glyphsForString(GLYPH)[0];
const box = glyph.path.bbox;

// An SVG of `size` px with the glyph's ink box scaled to `fill` of the side.
// Regular is the only weight bundled; a same-colour stroke (in font units)
// thickens it so it still reads at launcher size.
const EMBOLDEN = 44;

function svg(size, fill) {
  const scale = (size * fill) / Math.max(box.width, box.height);
  const tx = (size - box.width * scale) / 2 - box.minX * scale;
  // Font units grow upward: flip y, then centre the ink box vertically.
  const ty = (size - box.height * scale) / 2 + box.maxY * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${INK}"/>
  <path transform="translate(${tx} ${ty}) scale(${scale} ${-scale})" fill="${PAPER}" stroke="${PAPER}" stroke-width="${EMBOLDEN}" stroke-linejoin="miter" d="${glyph.path.toSVG()}"/>
</svg>`;
}

const outputs = [
  // "any" icons: full-bleed squares (launchers apply their own shape).
  ["public/icons/icon-192.png", 192, 0.6],
  ["public/icons/icon-512.png", 512, 0.6],
  // Maskable: the glyph stays well inside the 80% safe circle.
  ["public/icons/maskable-512.png", 512, 0.48],
  // iOS rounds the corners itself, so it's square and opaque too.
  ["app/apple-icon.png", 180, 0.6],
];

for (const [file, size, fill] of outputs) {
  await sharp(Buffer.from(svg(size, fill)))
    .png()
    .toFile(file);
  console.log("wrote", file);
}
