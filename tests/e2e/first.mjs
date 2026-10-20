import { serve, launch } from "./browser.mjs";
const { s, url } = await serve("/home/claude/omnisite"); const b = await launch(); const p = await b.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(String(e))); p.on("console", (m) => m.type() === "error" && errs.push(m.text()));
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await p.goto(url, { waitUntil: "networkidle0" }); await new Promise((r) => setTimeout(r, 600));
const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, ua: navigator.userAgent.slice(0, 40) }));
console.log(JSON.stringify(m), "errors:", JSON.stringify(errs));
await p.screenshot({ path: "/tmp/shots/before-phone-home.png" });
await b.close(); s.close();
