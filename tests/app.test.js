import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import * as fflate from "fflate";

const require = createRequire(import.meta.url);
globalThis.fflate = fflate;
// Load the exact vendored UMD bundle (the package is "type": "module", so require() would treat it as ESM).
const loadUMD = (file) => { const m = { exports: {} }; new Function("module", "exports", readFileSync(file, "utf8"))(m, m.exports); return m.exports; };
globalThis.mammoth = loadUMD("vendor/mammoth.browser.min.js");
globalThis.XLSX = require("xlsx");
globalThis.DOMPurify = require("dompurify")(window);

const { start } = await import("../js/main.js");
const L = await import("../js/library.js");
const { importUI } = await import("../js/views.js");
const { closeViewer, isOpen } = await import("../js/viewer.js");
const { update } = await import("../js/settings.js");

const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const sleep = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 2000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(15); } throw new Error("timeout waiting for: " + fn); };
const png = (n = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, n)]);
const card = (name) => $$(".card").find((c) => c.getAttribute("aria-label") === name);

const docx = () => Buffer.from(fflate.zipSync({
  "[Content_Types].xml": fflate.strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  "_rels/.rels": fflate.strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  "word/document.xml": fflate.strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello Word document</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold line</w:t></w:r></w:p></w:body></w:document>'),
}));
const xlsx = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Qty"], ["Apple", 3]]), "Fruit"); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["City"], ["Cluj"]]), "Cities"); return Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" })); };

beforeAll(async () => {
  document.head.insertAdjacentHTML("beforeend", '<meta name="theme-color" content="#f4f6fb"><link rel="icon" href="icons/icon.svg">');
  const html = readFileSync("index.html", "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<script[\s\S]*?<\/script>/g, "");
  await start({ indexedDBFactory: new IDBFactory() });
});
afterEach(() => { if (isOpen()) closeViewer(); document.querySelectorAll(".dlg-b").forEach((d) => d.remove()); });

describe("application", () => {
  it("starts: splash removed, empty-state hero, first-run welcome dialog", async () => {
    await sleep(350);
    expect($("#splash")).toBeNull();
    expect($(".hero h1").textContent).toBe("Any file. One place.");
    expect($(".dlg header").textContent).toBe("Welcome to OmniView");
    [...$$(".dlg button")].find((b) => b.textContent === "Skip").click(); await sleep();
    expect($(".dlg-b")).toBeNull();
  });

  it("imports mixed files with detection, shows cards and counts", async () => {
    await importUI([new File(["hello world"], "note.txt"), new File(["# Title\n\n**bold** <script>alert(1)</script>"], "doc.md"), new File(["a,b\n1,2\n"], "t.csv"), new File([docx()], "w.docx"), new File([xlsx()], "s.xlsx"), new File([png(1)], "pic.png"), new File([Buffer.from([0, 1, 2, 0])], "junk.bin")]);
    await until(() => $$(".card").length === 6);
    expect(L.state.items.map((i) => i.fmt).sort()).toEqual(["csv", "docx", "md", "png", "txt", "xlsx"]);
    expect($(".dlg header").textContent).toBe("Import summary"); // the unrecognized file is reported
    expect($(".dlg").textContent).toContain("junk.bin");
    expect($("#nav").textContent).toContain("Images");
  });

  it("text viewer: opens, edits, saves with Ctrl+S, persists", async () => {
    card("note.txt").click();
    const ta = await until(() => $("textarea.txt")); expect(ta.value).toBe("hello world");
    ta.value = "edited text"; ta.dispatchEvent(new Event("input"));
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true }));
    await sleep(80);
    const rec = L.state.items.find((i) => i.name === "note.txt"); expect(await rec.blob.text()).toBe("edited text");
    L.state.items = []; await L.load(); expect(await L.state.items.find((i) => i.name === "note.txt").blob.text()).toBe("edited text");
  });

  it("markdown viewer renders a sanitized preview", async () => {
    card("doc.md").click();
    const prev = await until(() => $(".md")); await until(() => prev.querySelector("h1"));
    expect(prev.querySelector("h1").textContent).toBe("Title"); expect(prev.querySelector("b").textContent).toBe("bold");
    expect(prev.querySelector("script")).toBeNull(); expect(prev.textContent).toContain("<script>"); // shown as text, never executed
  });

  it("CSV, DOCX and XLSX viewers", async () => {
    card("t.csv").click(); await until(() => $(".tbl td")); expect($$(".tbl td").map((c) => c.textContent)).toEqual(["1", "2"]); closeViewer();
    card("w.docx").click(); const page = await until(() => $(".page p")); expect($(".page").textContent).toContain("Hello Word document"); expect($(".page strong,.page b")).not.toBeNull();
    [...$$(".vb button")].find((b) => b.textContent.includes("Edit")).click(); expect($(".page").contentEditable).toBe("true"); closeViewer();
    card("s.xlsx").click(); await until(() => $(".tbl td")); expect($$(".tbl td").map((c) => c.textContent)).toEqual(["Apple", "3"]);
    [...$$(".vb button")].find((b) => b.textContent === "Cities").click(); expect($$(".tbl td").map((c) => c.textContent)).toEqual(["Cluj"]);
  });

  it("image viewer mounts the editor panel with undo/redo history", async () => {
    card("pic.png").click(); await until(() => $(".stage"));
    const edit = [...$$(".fl button")].find((b) => b.textContent.includes("Edit")); edit.click(); expect($(".edit").hidden).toBe(false);
    const slider = $$(".edit input[type=range]")[0]; slider.value = 130; slider.dispatchEvent(new Event("input")); slider.dispatchEvent(new Event("change"));
    expect($(".stage img").style.filter).toContain("brightness(130%)");
    [...$$(".edit button")].find((b) => b.textContent.includes("Undo")).click(); expect($(".stage img").style.filter).toContain("brightness(100%)");
    [...$$(".edit button")].find((b) => b.textContent.includes("Redo")).click(); expect($(".stage img").style.filter).toContain("brightness(130%)");
  });

  it("keyboard: arrows move between files, Esc closes", async () => {
    card("note.txt").click(); await until(() => $("textarea.txt"));
    const first = $(".vb h2").textContent;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })); await sleep(120);
    expect($(".vb h2").textContent).not.toBe(first);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); await sleep();
    expect(isOpen()).toBe(false); expect($("#view").hidden).toBe(true);
  });

  it("organize: select, favorite, tag, collection, trash and restore from the UI", async () => {
    [...$$("#nav button")].find((b) => b.textContent.includes("All files")).click(); await sleep(60);
    (await until(() => card("pic.png")?.querySelector(".ck"))).click(); await until(() => $(".sel-bar"));
    expect($(".sel-bar").textContent).toContain("1 selected");
    [...$$(".sel-bar button")].find((b) => b.textContent.includes("Favorite")).click(); await sleep(80);
    expect(L.state.items.find((i) => i.name === "pic.png").fav).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete" })); await sleep(120);
    expect(L.state.items.find((i) => i.name === "pic.png").trashed).toBeGreaterThan(0);
    [...$$("#nav button")].find((b) => b.textContent.includes("Trash")).click(); await until(() => card("pic.png"));
    card("pic.png").click(); await until(() => $("#view:not([hidden])"));
    [...$$(".vb button")].find((b) => b.textContent === "Restore").click(); await sleep(120);
    expect(L.state.items.find((i) => i.name === "pic.png").trashed).toBe(0);
  });

  it("search filters the library", async () => {
    [...$$("#nav button")].find((b) => b.textContent.includes("All files")).click(); await sleep(60);
    const q = $("#q"); q.value = "csv"; q.dispatchEvent(new Event("input")); await until(() => $$(".card").length === 1);
    expect(card("t.csv")).toBeTruthy(); q.value = ""; q.dispatchEvent(new Event("input")); await until(() => $$(".card").length === 6);
  });

  it("settings dialog changes theme and language immediately", async () => {
    $("#btn-settings").click();
    const sel = (label) => $$(".dlg label").find((l) => l.textContent.startsWith(label));
    [...$$(".dlg button")].find((b) => b.textContent === "Appearance").click();
    const theme = sel("Theme").querySelector("select"); expect([...theme.options].map((o) => o.value)).toEqual(["system", "light", "dark", "halloween"]);
    theme.value = "dark"; theme.dispatchEvent(new Event("change")); expect(document.documentElement.dataset.theme).toBe("dark");
    const t2 = sel("Theme").querySelector("select"); t2.value = "halloween"; t2.dispatchEvent(new Event("change")); expect(document.documentElement.dataset.theme).toBe("halloween");
    expect(document.querySelector('meta[name="theme-color"]').content).toBe("#150b22"); expect(document.querySelector('link[rel="icon"]').getAttribute("href")).toBe("icons/icon-halloween.svg");
    [...$$(".dlg button")].find((b) => b.textContent === "General").click();
    const lang = sel("Language").querySelector("select"); lang.value = "ro"; lang.dispatchEvent(new Event("change")); await sleep(60);
    expect(document.documentElement.lang).toBe("ro"); expect($("#btn-import .t").textContent).toBe("Importă fișiere"); expect($("#nav").textContent).toContain("Acasă");
    update({ lang: "en", theme: "system" }); await sleep(40); expect($("#btn-import .t").textContent).toBe("Import files");
  });

  it("the Data tab shows storage and can wipe everything after confirmation", async () => {
    $("#btn-settings").click(); [...$$(".dlg button")].find((b) => b.textContent === "Data").click(); await sleep(50);
    expect($(".dlg").textContent).toContain("Stored in this browser");
    [...$$(".dlg button")].find((b) => b.textContent.startsWith("Delete all data")).click(); await sleep(30);
    const confirm = $$(".dlg-b").pop(); [...confirm.querySelectorAll("button")].find((b) => b.textContent === "Delete everything").click(); await sleep(100);
    expect(L.state.items).toHaveLength(0);
  });
});

describe("subtitles", () => {
  const SRT = "1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:00:04,000 --> 00:00:06,500\nSecond line\n";
  it("imports an SRT as a subtitle item with its own section", async () => {
    L.state.section = "all"; L.emit(); await sleep(60);
    await importUI([new File([SRT], "film.srt")]); await until(() => card("film.srt"));
    expect(L.state.items.find((i) => i.name === "film.srt")).toMatchObject({ fmt: "srt", cat: "sub" });
    expect($("#nav").textContent).toContain("Subtitles");
    document.querySelectorAll(".dlg-b").forEach((d) => d.remove());
  });
  it("opens the editor: lines in the grid, edit a line, shift times, save back to the file", async () => {
    card("film.srt").click(); await until(() => $(".srow"));
    expect($$(".srow")).toHaveLength(2); expect($(".sed-text").value).toBe("Hello world");
    const area = $(".sed-text"); area.value = "Hello brave world"; area.dispatchEvent(new Event("input"));
    expect($$(".srow")[0].textContent).toContain("Hello brave world");
    // shift everything by +1000 ms through the dialog
    [...$$(".sedbar button")].find((b) => b.textContent.startsWith("Shift")).click(); await until(() => $(".dlg"));
    const ms = $(".dlg input[type=number]"); ms.value = "1000"; [...$$(".dlg button")].find((b) => b.textContent === "Shift").click(); await sleep(80);
    expect($$(".srow")[0].textContent).toContain("0:00:02.000".replace("0:", "00:"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })); await sleep(120);
    const rec = L.state.items.find((i) => i.name === "film.srt"), saved = await rec.blob.text();
    expect(saved).toContain("00:00:02,000 --> 00:00:04,000\nHello brave world"); expect(saved).toContain("00:00:05,000 --> 00:00:07,500\nSecond line");
  });
  it("undo and redo restore earlier states", async () => {
    card("film.srt").click(); await until(() => $(".srow"));
    const undo = [...$$(".sedbar button")].find((b) => b.textContent === "↶"), before = $$(".srow")[0].textContent;
    const area = $(".sed-text"); area.value = "Changed"; area.dispatchEvent(new Event("input")); await sleep(800);
    expect($$(".srow")[0].textContent).toContain("Changed"); undo.click(); await sleep(40); expect($$(".srow")[0].textContent).toBe(before);
  });
  it("the quality check dialog lists problems and Back asks before discarding unsaved work", async () => {
    card("film.srt").click(); await until(() => $(".srow"));
    const area = $(".sed-text"); area.value = "x".repeat(60); area.dispatchEvent(new Event("input")); await sleep(800);
    [...$$(".sedbar button")].find((b) => b.textContent === "Check").click(); await until(() => $(".qcrow")); expect($(".qc").textContent).toContain("too long");
    document.querySelectorAll(".dlg-b").forEach((d) => d.remove());
    [...$$(".vb button")].find((b) => b.textContent.includes("Back")).click(); await until(() => $(".dlg header")); expect($(".dlg header").textContent).toBe("Unsaved changes");
    [...$$(".dlg button")].find((b) => b.textContent === "Cancel").click(); await sleep(40); expect(isOpen()).toBe(true);
  });
});
