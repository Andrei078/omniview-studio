// Visual pass: screenshots + overflow report for every viewport.   node tests/e2e/shots.mjs [outDir] [theme]
import { launch, serve, VIEWPORTS, newPage, importFiles, overflowProbe, sleep, SHOTS, FIX } from "./lib.mjs";
import { makeFixtures } from "./fixtures.mjs";
const out = process.argv[2] || SHOTS, theme = process.argv[3] || "";
const fx = await makeFixtures(FIX); const { s, url } = await serve(process.cwd()); const b = await launch();
const only = process.env.VP ? process.env.VP.split(",") : Object.keys(VIEWPORTS);
for (const name of only) {
  const vp = VIEWPORTS[name]; const { page, errors } = await newPage(b, url, vp, { theme });
  const rep = {}; const snap = async (k) => { rep[k] = await page.evaluate(overflowProbe); const stray = await page.evaluate(() => /(^|\s)(null|undefined|NaN)(\s|$)/m.test(document.body.innerText)); if (stray) rep[k].bad.push("stray null/undefined/NaN text"); await page.screenshot({ path: `${out}/${name}-${k}.png` }); };
  await snap("0-empty");
  await importFiles(page, [fx.png, fx.png2, fx.pdf, fx.docx, fx.xlsx, fx.txt, fx.md, fx.csv]); await sleep(300);
  await snap("1-home");
  await page.evaluate(() => [...document.querySelectorAll("#nav button")].find((x) => x.textContent.includes("All files")).click()); await sleep(500); await snap("2-library");
  const card = async (n) => page.evaluate((n) => { [...document.querySelectorAll(".card")].find((c) => c.getAttribute("aria-label") === n)?.click(); }, n);
  for (const [n, k] of [["report.pdf", "3-pdf"], ["sunset.png", "4-image"], ["notes.txt", "5-text"], ["letter.docx", "6-docx"], ["budget.xlsx", "7-xlsx"]]) {
    await card(n); await sleep(1800); await snap(k); await page.keyboard.press("Escape"); await sleep(250);
  }
  await page.click("#btn-settings"); await sleep(400); await snap("8-settings"); await page.keyboard.press("Escape"); await sleep(200);
  console.log(name.padEnd(17), Object.entries(rep).map(([k, v]) => `${k}:${v.scrollWidth <= v.clientWidth + 1 && !v.bad.length ? "ok" : "OVERFLOW " + v.scrollWidth + ">" + v.clientWidth + " " + v.bad.slice(0, 3).join(" | ")}`).join("  "), errors.length ? "\n  ERRORS: " + errors.slice(0, 3).join(" ; ") : "");
  await page.close();
}
await b.close(); s.close();
