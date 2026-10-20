import { launch, serve } from "./browser.mjs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
export const SHOTS = join(tmpdir(), "omniview-shots"), FIX = join(tmpdir(), "omniview-fixtures");
mkdirSync(SHOTS, { recursive: true });
export const VIEWPORTS = {
  "phone-small": { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "phone": { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "phone-landscape": { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "tablet-portrait": { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "tablet-landscape": { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "desktop": { width: 1440, height: 900, deviceScaleFactor: 1 },
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Elements that stick out of the viewport horizontally (ignoring ones inside horizontally scrollable boxes). */
export const overflowProbe = () => {
  const iw = document.documentElement.clientWidth, bad = [];
  const scrollable = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") return true; } return false; };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed" && el.closest("body::before")) continue;
    if ((r.right > iw + 1 || r.left < -1) && !scrollable(el) && !el.closest("svg")) bad.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").join(".") : ""} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  return { scrollWidth: document.documentElement.scrollWidth, clientWidth: iw, bad: bad.slice(0, 8) };
};

export async function newPage(browser, url, vp, { theme } = {}) {
  const page = await browser.newPage(); const errors = [];
  const cdp = await page.createCDPSession(); await cdp.send("Storage.clearDataForOrigin", { origin: new URL(url).origin, storageTypes: "all" }); // every test starts with an empty library
  page.on("pageerror", (e) => errors.push(String(e))); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.setViewport(vp);
  await page.evaluateOnNewDocument((th) => { try { localStorage.setItem("ov-settings", JSON.stringify({ onboarded: true, theme: th || "system", lang: "en" })); } catch {} }, theme);
  await page.goto(url, { waitUntil: "networkidle0" }); await sleep(500);
  return { page, errors };
}
export async function importFiles(page, paths) {
  const input = await page.$("#fi"); await input.uploadFile(...paths);
  await page.waitForFunction((n) => document.querySelectorAll(".card").length >= n, { timeout: 15000 }, 1); await sleep(700);
}
export { launch, serve };
