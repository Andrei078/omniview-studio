// Contact sheet of screenshots:  node tests/e2e/montage.mjs out.png width file1 file2 ...
import sharp from "sharp";
const [out, w, ...files] = process.argv.slice(2); const W = +w;
const imgs = await Promise.all(files.map(async (f) => { const b = await sharp(f).resize({ width: W }).png().toBuffer(); const m = await sharp(b).metadata(); return { b, h: m.height }; }));
const H = Math.max(...imgs.map((i) => i.h)); let x = 0;
await sharp({ create: { width: W * imgs.length + 8 * (imgs.length - 1), height: H, channels: 3, background: "#888" } }).composite(imgs.map((i) => { const o = { input: i.b, left: x, top: 0 }; x += W + 8; return o; })).png().toFile(out);
