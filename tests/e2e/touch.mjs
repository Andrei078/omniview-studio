// Touch gestures in a real browser with an emulated touchscreen.   node tests/e2e/touch.mjs
import { launch, serve, VIEWPORTS, newPage, importFiles, sleep, SHOTS, FIX } from "./lib.mjs";
import { makeFixtures } from "./fixtures.mjs";
const fx = await makeFixtures(FIX); const { s, url } = await serve(process.cwd()); const b = await launch(); let failed = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) failed++; };
for (const name of (process.env.VP || "phone,tablet-portrait").split(",")) {
  console.log("== " + name);
  const { page, errors } = await newPage(b, url, VIEWPORTS[name]); const cdp = await page.createCDPSession();
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  const tap = async (x, y) => { await touch("touchStart", [[x, y]]); await sleep(60); await touch("touchEnd", []); await sleep(250); };
  const center = (sel, text) => page.evaluate((sel, text) => { const e = [...document.querySelectorAll(sel)].find((x) => !text || x.textContent.includes(text) || x.getAttribute("aria-label") === text); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel, text);
  const tapSel = async (sel, text) => { const c = await center(sel, text); if (!c) throw new Error("not found: " + sel + " " + (text || "")); await tap(...c); };
  const pinch = async (cx, cy, d0, d1) => { await touch("touchStart", [[cx - d0 / 2, cy], [cx + d0 / 2, cy]]); for (let i = 1; i <= 8; i++) { const d = d0 + ((d1 - d0) * i) / 8; await touch("touchMove", [[cx - d / 2, cy], [cx + d / 2, cy]]); await sleep(30); } await touch("touchEnd", []); await sleep(500); };
  await importFiles(page, [fx.png, fx.png2, fx.pdf, fx.txt]); await sleep(300);
  await tapSel("#nav button", "All files"); await sleep(500);

  // card menu: bottom sheet on phones
  const c1 = await center('.card[aria-label="notes.txt"] .more'); await tap(...c1);
  const ctx = await page.evaluate(() => { const e = document.querySelector(".ctx"); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
  ok(!!ctx, "the ⋯ button opens the card menu"); if (name === "phone") ok(ctx && ctx.l <= 1 && ctx.r >= ctx.vw - 1 && ctx.b >= ctx.vh - 2, "on a phone the menu is a full-width bottom sheet");
  await tapSel(".ctx button", "Add to favorites"); await sleep(400);
  ok(await page.evaluate(() => [...document.querySelectorAll(".card")].find((c) => c.getAttribute("aria-label") === "notes.txt")?.textContent.includes("★")), "tapping an action in the menu works (favorite set)");

  // long press selects without opening
  const c2 = await center('.card[aria-label="report.pdf"] .th');
  await touch("touchStart", [c2]); await sleep(650); await touch("touchEnd", []); await sleep(500);
  ok(await page.evaluate(() => /^1 selected/.test(document.querySelector(".sel-bar")?.textContent || "") && document.querySelector("#view").hidden), "long-press selects exactly that card, does not open it and does not trigger a button under the finger");
  await tap(...(await center('.card[aria-label="forest.png"] .ck'))); await sleep(300); // a second card via its checkbox
  ok(await page.evaluate(() => /2 selected/.test(document.querySelector(".sel-bar")?.textContent || "")), "tapping the checkbox adds to the selection");
  await page.evaluate(() => [...document.querySelectorAll(".sel-bar button")].find((x) => x.textContent === "Clear").click()); await sleep(300);

  // viewer: actions in a sheet on phones
  await tapSel('.card[aria-label="sunset.png"] .th'); await sleep(1200);
  const vis = await page.evaluate(() => ({ act: getComputedStyle(document.querySelector(".vact")).display, more: getComputedStyle(document.querySelector(".vmore")).display }));
  if (name === "phone") { ok(vis.act === "none" && vis.more !== "none", "phone viewer keeps its actions in the ⋯ sheet"); await tapSel(".vmore"); await sleep(300); ok(await page.evaluate(() => { const e = document.querySelector(".vact.open"); if (!e) return false; const r = e.getBoundingClientRect(); return r.bottom >= innerHeight - 2 && r.width >= innerWidth - 2; }), "the actions sheet is full width at the bottom"); await tapSel(".vscrim"); await sleep(300); }

  // pinch zoom on the image
  const st = await center(".stage"); const z0 = await page.evaluate(() => document.querySelector(".stage img").style.transform);
  await pinch(st[0], st[1], 80, 240);
  const scale = await page.evaluate(() => { const m = /scale\(([-\d.]+)/.exec(document.querySelector(".stage img").style.transform); return m ? Math.abs(+m[1]) : 1; });
  ok(scale > 1.8, "pinching out zooms the image (scale " + scale.toFixed(2) + ")");
  await page.screenshot({ path: `${SHOTS}/touch-${name}-pinch.png` });
  await page.evaluate(() => document.querySelector("#view .vb button").click()); await sleep(400);

  // pinch zoom on the PDF
  await tapSel('.card[aria-label="report.pdf"] .th'); await sleep(2000);
  const w0 = await page.evaluate(() => parseFloat(document.querySelector(".pdf canvas").style.width));
  const pc = await center(".pdf"); await pinch(pc[0], pc[1] + 60, 80, 200); await sleep(900);
  const w1 = await page.evaluate(() => parseFloat(document.querySelector(".pdf canvas").style.width));
  ok(w1 > w0 * 1.4, `pinching out zooms the PDF (page width ${Math.round(w0)} -> ${Math.round(w1)} px)`);
  await page.evaluate(() => document.querySelector("#view .vb button").click()); await sleep(300);

  // settings sheet
  await tapSel("#btn-settings"); await sleep(400);
  const sh = await page.evaluate(() => { const r = document.querySelector(".dlg").getBoundingClientRect(); return { w: r.width, b: r.bottom, vw: innerWidth, vh: innerHeight }; });
  if (name === "phone") ok(sh.w >= sh.vw - 2 && sh.b >= sh.vh - 2, "settings open as a bottom sheet on phones");
  ok(!errors.length, "no console/page errors" + (errors.length ? " -> " + errors.slice(0, 3).join(" ; ") : ""));
  await page.close();
}
await b.close(); s.close(); console.log(failed ? `\n${failed} FAILED` : "\nall touch checks passed"); process.exit(failed ? 1 : 0);
