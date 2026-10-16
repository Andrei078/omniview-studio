// Generates PNG icons from icons/icon.svg:  node scripts/make-icons.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";
const svg = readFileSync("icons/icon.svg", "utf8");
const full = svg.replace('rx="16"', 'rx="0"'); // maskable icons must be full-bleed
const jobs = [["icons/icon-192.png", svg, 192], ["icons/icon-512.png", svg, 512], ["icons/apple-touch-icon.png", full, 180], ["icons/maskable-512.png", full.replace('<g transform="translate(32 32)">', '<g transform="translate(32 32) scale(.8)">'), 512]];
for (const [out, s, n] of jobs) await sharp(Buffer.from(s), { density: 384 }).resize(n, n).png().toFile(out);
console.log("icons ok");
