// Copies only the files a host needs into _site/ :  npm run package
import { cpSync, mkdirSync, rmSync } from "node:fs";
rmSync("_site", { recursive: true, force: true }); mkdirSync("_site");
for (const f of ["index.html", "manifest.webmanifest", "sw.js", "_headers"]) cpSync(f, "_site/" + f);
for (const d of ["css", "js", "vendor", "fonts", "icons"]) cpSync(d, "_site/" + d, { recursive: true });
console.log("_site/ is ready to upload to any static host.");
