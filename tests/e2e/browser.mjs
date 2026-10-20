// Shared harness: static server + headless Chromium (puppeteer-core + @sparticuz/chromium).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
export function serve(root, port = 0) {
  return new Promise((ok) => { const s = http.createServer(async (q, r) => { try { let p = normalize(decodeURIComponent(q.url.split("?")[0])); if (p.endsWith("/")) p += "index.html"; const b = await readFile(join(root, p)); r.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end("nf"); } }); s.listen(port, "127.0.0.1", () => ok({ s, url: "http://127.0.0.1:" + s.address().port + "/" })); });
}
export async function launch() {
  return puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, "--no-sandbox", "--disable-gpu", "--autoplay-policy=no-user-gesture-required"], headless: "shell" });
}
