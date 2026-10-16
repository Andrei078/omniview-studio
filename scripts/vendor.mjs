// Copies the self-hosted libraries from node_modules into vendor/ and fonts/:  npm install && npm run vendor
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("vendor", { recursive: true }); mkdirSync("fonts", { recursive: true });
const N = "node_modules/", F = N + "@fontsource-variable/";
const pairs = [[N + "pdfjs-dist/build/pdf.min.js", "vendor/pdf.min.js"], [N + "pdfjs-dist/build/pdf.worker.min.js", "vendor/pdf.worker.min.js"], [N + "mammoth/mammoth.browser.min.js", "vendor/mammoth.browser.min.js"], [N + "dompurify/dist/purify.min.js", "vendor/purify.min.js"], [N + "xlsx/dist/xlsx.full.min.js", "vendor/xlsx.full.min.js"], [N + "fflate/umd/index.js", "vendor/fflate.min.js"]];
for (const f of ["bricolage-grotesque-latin-wght-normal", "bricolage-grotesque-latin-ext-wght-normal"]) pairs.push([F + "bricolage-grotesque/files/" + f + ".woff2", "fonts/" + f + ".woff2"]);
for (const f of ["hanken-grotesk-latin-wght-normal", "hanken-grotesk-latin-ext-wght-normal"]) pairs.push([F + "hanken-grotesk/files/" + f + ".woff2", "fonts/" + f + ".woff2"]);
for (const [a, b] of pairs) copyFileSync(a, b);
console.log("vendored " + pairs.length + " files. Run `npm run build:sw` next.");
