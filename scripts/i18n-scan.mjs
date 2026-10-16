// Collects every translatable string: t("…"), msg("…") in js/ and data-i / data-ip / data-it in index.html.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const CALL = /(?<![\w.$])(?:t|msg)\(\s*"((?:[^"\\]|\\.)*)"/g;
const ATTR = /\bdata-(?:i|ip|it)="([^"]*)"/g;
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) { if (n !== "lang") walk(p, out); } else if (n.endsWith(".js")) out.push(p); } return out; };
const un = (raw) => JSON.parse(`"${raw}"`);

export function scanKeys(root = ".") {
  const keys = new Set();
  for (const f of walk(join(root, "js"))) for (const m of readFileSync(f, "utf8").matchAll(CALL)) keys.add(un(m[1]));
  for (const m of readFileSync(join(root, "index.html"), "utf8").matchAll(ATTR)) keys.add(m[1]);
  return [...keys].sort();
}
export const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
if (process.argv[1]?.endsWith("i18n-scan.mjs")) { const k = scanKeys("."); console.log(k.length); console.log(JSON.stringify(k, null, 0)); }
