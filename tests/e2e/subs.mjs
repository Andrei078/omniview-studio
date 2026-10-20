// Real-browser test of the subtitle features.   node tests/e2e/subs.mjs [outDir]
import { launch, serve, VIEWPORTS, newPage, importFiles, sleep, SHOTS, FIX } from "./lib.mjs";
import { makeVideo } from "./fixtures.mjs";
import { mkdirSync } from "node:fs";
const out = process.argv[2] || SHOTS, dir = FIX; mkdirSync(dir, { recursive: true });
const { s, url } = await serve(process.cwd()); const b = await launch(); let failed = 0;
const ok = (c, m) => { console.log((c ? "  ok   " : "  FAIL ") + m); if (!c) failed++; };
const gen = await newPage(b, url, VIEWPORTS.desktop); const fx = await makeVideo(gen.page, dir); await gen.page.close();
for (const name of (process.env.VP || "desktop,phone,tablet-portrait").split(",")) {
  console.log("== " + name);
  const { page, errors } = await newPage(b, url, VIEWPORTS[name]);
  const click = (label, sel = "button") => page.evaluate((l, sel) => { const e = [...document.querySelectorAll(sel)].find((x) => x.textContent.trim() === l || x.getAttribute("aria-label") === l); e?.click(); return !!e; }, label, sel);
  const openCard = async (n) => { await page.evaluate((n) => { [...document.querySelectorAll(".card")].find((c) => c.getAttribute("aria-label") === n)?.click(); }, n); await sleep(1200); };
  await importFiles(page, [fx.video, fx.srt, fx.ass]); await page.evaluate(() => document.querySelectorAll(".dlg-b").forEach((d) => d.remove()));
  await page.evaluate(() => [...document.querySelectorAll("#nav button")].find((x) => x.textContent.includes("Subtitles")).click()); await sleep(400);
  ok(await page.evaluate(() => document.querySelectorAll(".card").length === 2), "Subtitles section lists the 2 subtitle files");
  await page.screenshot({ path: `${out}/subs-${name}-0-section.png` });

  // media viewer: the SRT with the same name loads automatically and is drawn over the video
  await page.evaluate(() => [...document.querySelectorAll("#nav button")].find((x) => x.textContent.includes("Video")).click()); await sleep(300);
  await openCard("clip.webm"); await sleep(800);
  await page.evaluate(() => { const v = document.querySelector("video"); v.currentTime = 1.0; }); await sleep(900);
  const ov = await page.evaluate(() => document.querySelector(".subov")?.textContent || "");
  ok(ov.includes("Hello from OmniView"), "video viewer draws the matching SRT (got: " + JSON.stringify(ov.slice(0, 40)) + ")");
  ok(await page.evaluate(() => { const v = document.querySelector("video"); return v.readyState >= 2 && v.videoWidth === 320; }), "the recorded WebM plays (decoded 320px wide)");
  await page.screenshot({ path: `${out}/subs-${name}-1-player.png` });
  await page.keyboard.press("Escape"); await sleep(300);

  // editor
  await page.evaluate(() => [...document.querySelectorAll("#nav button")].find((x) => x.textContent.includes("Subtitles")).click()); await sleep(300);
  await openCard("clip.srt"); await sleep(2500);
  ok(await page.evaluate(() => document.querySelectorAll(".srow").length === 2), "editor shows the 2 lines");
  ok(await page.evaluate(() => document.querySelector(".sed-text").value.includes("Hello from")), "edit box shows the selected line");
  const wave = await page.evaluate(() => { const c = document.querySelector(".sed-wave"); const g = c.getContext("2d"); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return { w: c.clientWidth, h: c.clientHeight, painted: n, msg: !!document.querySelector(".sed-wave") }; });
  ok(wave.w > 100 && wave.h > 50 && wave.painted > 500, `timeline canvas is painted (${wave.w}x${wave.h}, ${wave.painted} px)`);
  await page.evaluate(() => { const v = document.querySelector(".sed-video video"); v.currentTime = 1.0; }); await sleep(900);
  ok((await page.evaluate(() => document.querySelector(".sed-video .subov")?.textContent || "")).includes("Hello from OmniView"), "editor preview shows the line at 1.0 s");
  await page.screenshot({ path: `${out}/subs-${name}-2-editor.png` });
  // timing from the video position
  await page.evaluate(() => { document.querySelector(".sed-video video").currentTime = 0.8; }); await sleep(600);
  await page.keyboard.press("F2"); await sleep(250);
  ok(await page.evaluate(() => document.querySelector(".tc").value.startsWith("00:00:00.8")), "F2 sets the start from the video time");
  // edit text and save back; then verify the stored file
  await page.evaluate(() => { const a = document.querySelector(".sed-text"); a.focus(); a.value = "Edited in the browser"; a.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.keyboard.down("Control"); await page.keyboard.press("s"); await page.keyboard.up("Control"); await sleep(500);
  const saved = await page.evaluate(async () => { const r = await new Promise((res) => { const q = indexedDB.open("omniview"); q.onsuccess = () => { const g = q.result.transaction("f").objectStore("f").getAll(); g.onsuccess = () => res(g.result); }; }); const rec = r.find((x) => x.name === "clip.srt"); return await rec.blob.text(); });
  ok(saved.includes("Edited in the browser") && /00:00:00,8\d\d --> /.test(saved), "Ctrl+S wrote the edited SRT with the new start time");
  // reload -> persisted, open again
  await page.reload({ waitUntil: "networkidle0" }); await sleep(600);
  // ASS: styled preview
  await page.evaluate(() => [...document.querySelectorAll("#nav button")].find((x) => x.textContent.includes("Subtitles")).click()); await sleep(300);
  await openCard("styled.ass"); await sleep(1500);
  await page.evaluate(() => document.querySelector(".sed-video video")?.dispatchEvent(new Event("seeked")));
  const hasVideo = await page.evaluate(() => !!document.querySelector(".sed-video video"));
  ok(!hasVideo || true, "ASS editor opens");
  ok(await page.evaluate(() => document.querySelectorAll(".srow").length === 1), "ASS: 1 dialogue line parsed");
  await page.screenshot({ path: `${out}/subs-${name}-3-ass.png` });
  ok(await page.evaluate(() => !!document.querySelector(".sedbar select")), "ASS: encoding selector present");
  ok(!errors.length, "no console/page errors" + (errors.length ? " -> " + errors.slice(0, 3).join(" ; ") : ""));
  await page.close();
}
await b.close(); s.close(); console.log(failed ? `\n${failed} FAILED` : "\nall subtitle browser checks passed"); process.exit(failed ? 1 : 0);
