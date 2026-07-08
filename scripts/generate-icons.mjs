// Génère les icônes PWA (PNG) sans dépendance externe — zlib Node uniquement.
// Usage : node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// Monochrome (direction minimaliste PO) : haltère gris clair sur near-black.
const BG = [10, 10, 10, 255]; // #0a0a0a
const FG = [237, 237, 237, 255]; // #ededed

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines avec filtre 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Haltère : rectangles symétriques (fractions de la taille, centrés verticalement).
const RECTS = [
  [0.34, 0.66, 0.045], // barre
  [0.23, 0.31, 0.17], // plaque intérieure gauche
  [0.15, 0.22, 0.12], // plaque extérieure gauche
  [0.69, 0.77, 0.17], // plaque intérieure droite
  [0.78, 0.85, 0.12], // plaque extérieure droite
];

function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = x / size,
        fy = y / size;
      let color = BG;
      for (const [x0, x1, hh] of RECTS) {
        if (fx >= x0 && fx <= x1 && Math.abs(fy - 0.5) <= hh) {
          color = FG;
          break;
        }
      }
      color.forEach((v, i) => (px[(y * size + x) * 4 + i] = v));
    }
  }
  return png(size, px);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192));
writeFileSync("public/icons/icon-512.png", draw(512));
writeFileSync("src/app/apple-icon.png", draw(180));
console.log("Icônes générées : public/icons/{icon-192,icon-512}.png + src/app/apple-icon.png");
