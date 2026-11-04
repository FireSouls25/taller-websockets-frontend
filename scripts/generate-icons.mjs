// Generates the juror PWA icons with zero dependencies.
// Dark rounded square (product ink) + white ballot box + accent slot.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const INK = [20, 20, 20, 255];
const PAPER = [244, 243, 241, 255];
const ACCENT = [29, 95, 191, 255];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (const b of buf) crc = (crc >>> 8) ^ table[(crc ^ b) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function roundedRect(px, size, x0, y0, x1, y1, r, color) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const cx = Math.min(Math.max(x, x0 + r), x1 - 1 - r);
      const cy = Math.min(Math.max(y, y0 + r), y1 - 1 - r);
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
        const i = (y * size + x) * 4;
        px[i] = color[0]; px[i + 1] = color[1]; px[i + 2] = color[2]; px[i + 3] = color[3];
      }
    }
  }
}

function makeIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    px[i * 4] = INK[0]; px[i * 4 + 1] = INK[1]; px[i * 4 + 2] = INK[2]; px[i * 4 + 3] = 255;
  }
  const m = Math.floor(size * 0.22);
  // ballot box body
  roundedRect(px, size, m, Math.floor(size * 0.4), size - m, size - m, Math.floor(size * 0.05), PAPER);
  // ballot slot (accent)
  const slotY0 = Math.floor(size * 0.3);
  roundedRect(px, size, Math.floor(size * 0.32), slotY0, Math.floor(size * 0.68), slotY0 + Math.floor(size * 0.06), Math.floor(size * 0.03), ACCENT);
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "jurado", "public");
for (const size of [192, 512]) {
  writeFileSync(join(dir, `icono-${size}.png`), makeIcon(size));
  console.log(`icono-${size}.png`);
}
