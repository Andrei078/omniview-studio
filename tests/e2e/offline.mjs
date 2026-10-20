// The app must start and keep working with the network switched off (service worker + local libraries).   node tests/e2e/offline.mjs
import { launch, serve, VIEWPORTS, newPage, importFiles, sleep, SHOTS, FIX } from "./lib.mjs";
import { makeFixtures } from "./fixtures.mjs";
const fx = await makeFixtures(FIX); const { s, url } = await serve(process.cwd()); const b = await launch(); let failed = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) failed++; };
const { page, errors } = await newPage(b, url, VIEWPORTS.phone);
await page.evaluate(() => navigator.serviceWorker.ready); await sleep(1500);
ok(await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), "service worker registered");
await importFiles(page, [fx.png, fx.pdf, fx.docx]); await page.evaluate(() => document.querySelectorAll(".dlg-b").forEach((d) => d.remove()));
await page.setOfflineMode(true); s.close(); // the server is gone too: everything must come from the cache
await page.reload({ waitUntil: "load" }); await sleep(1500);
ok(await page.evaluate(() => document.querySelectorAll(".card").length >= 3), "offline: page reloads and the library is still there");
await page.evaluate(() => [...document.querySelectorAll(".card")].find((c) => c.getAttribute("aria-label") === "report.pdf")?.click()); await sleep(3000);
ok(await page.evaluate(() => { const c = document.querySelector(".pdf canvas"); return !!c && c.width > 10; }), "offline: the PDF viewer (PDF.js + worker from the cache) renders a page");
await page.evaluate(() => document.querySelector("#view .vb button").click()); await sleep(300);
await page.evaluate(() => [...document.querySelectorAll(".card")].find((c) => c.getAttribute("aria-label") === "letter.docx")?.click()); await sleep(2000);
ok(await page.evaluate(() => document.querySelector(".page")?.textContent.includes("Raport trimestrial")), "offline: the Word viewer (mammoth from the cache) works");
ok(!errors.filter((e) => !/Failed to load resource|net::ERR/.test(e)).length, "no script errors" + (errors.length ? " -> " + errors.slice(0, 2).join(" ; ") : ""));
await b.close(); console.log(failed ? `\n${failed} FAILED` : "\nall offline checks passed"); process.exit(failed ? 1 : 0);
