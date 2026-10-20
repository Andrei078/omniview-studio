// Subtitle editor (SRT / WebVTT / ASS-SSA) in the spirit of Aegisub: video preview with live subtitles, timeline with
// draggable start/end handles, line grid, edit box, timing tools, styles, quality checks, encodings and conversion.
import { h, put, toast, bar } from "../util.js";
import { t } from "../i18n.js";
import * as S from "../subs.js";
import * as L from "../library.js";
import { SubOverlay } from "../subs-overlay.js";
import { form, ask } from "../dialogs.js";
import { msg } from "../i18n.js";

const draftKey = (id) => "ov-subdraft-" + id;
const T = (ms) => S.fmtTime(ms, "vtt");
const toArea = (s) => s.replace(/\\N/g, "\n"), fromArea = (s) => s.replace(/\r?\n/g, "\\N");
/** Translatable text for each kind of problem reported by S.qc(). */
const QC_TEXT = { empty: msg("Empty text"), duration: msg("Zero or negative duration"), short: msg("Very short line"), long: msg("Very long line"), cps: msg("Reading speed is too high"), width: msg("A line is too long"), overlap: msg("Overlaps the next line") };
const FPS = [23.976, 24, 25, 29.97, 30, 50, 59.94, 60];
const hex = (assColor) => S.assColorToCss(assColor) || "#ffffff";

async function computePeaks(blob) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC || blob.size > 64 * 1048576) return null;
  const ac = new AC();
  try {
    const buf = await ac.decodeAudioData(await blob.arrayBuffer()), ch = buf.getChannelData(0), step = Math.max(1, Math.floor(buf.sampleRate / 100)), peaks = new Float32Array(Math.ceil(ch.length / step)), stride = Math.max(1, Math.floor(step / 24));
    let max = 0.001;
    for (let i = 0; i < peaks.length; i++) { let m = 0; for (let j = i * step, e = Math.min(ch.length, j + step); j < e; j += stride) { const v = Math.abs(ch[j]); if (v > m) m = v; } peaks[i] = m; if (m > max) max = m; }
    for (let i = 0; i < peaks.length; i++) peaks[i] /= max;
    return peaks;
  } finally { ac.close?.(); }
}

export async function mount(rec, body, ctx) {
  const bytes = new Uint8Array(await rec.blob.arrayBuffer());
  let decoded = S.decodeBytes(bytes), encPick = "auto", doc, hist, hi, sel, cur, dirty = false, issues = new Map(), vid = null, overlay = null, peaks = null, activeId = null, stopAt = null, winSec = 12;
  const ROW = matchMedia("(max-width:700px)").matches ? 58 : 34;
  const ev = () => doc.events.find((e) => e.id === cur);

  function load(enc) {
    decoded = S.decodeBytes(bytes, enc);
    doc = S.parse(decoded.text, rec.fmt); if (doc.format !== "ass") S.sortEvents(doc);
    hist = [structuredClone(doc)]; hi = 0; cur = doc.events[0]?.id ?? null; sel = new Set(cur != null ? [cur] : []); dirty = false;
  }
  load("auto");

  // ---------- history / persistence ----------
  const snap = () => { hist = hist.slice(0, hi + 1); hist.push(structuredClone(doc)); if (hist.length > 80) hist.shift(); hi = hist.length - 1; };
  const saveDraft = () => { try { localStorage.setItem(draftKey(rec.id), JSON.stringify({ text: S.serialize(doc, "ass").text })); } catch { /* storage may be full */ } };
  let draftTimer; const scheduleDraft = () => { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 1200); };
  const touch = () => { dirty = true; scheduleDraft(); };
  function mutate(fn) { fn(); if (!doc.events.some((e) => e.id === cur)) { cur = [...sel].find((id) => doc.events.some((e) => e.id === id)) ?? doc.events[0]?.id ?? null; } sel = new Set([...sel].filter((id) => doc.events.some((e) => e.id === id))); if (cur != null && !sel.size) sel.add(cur); snap(); touch(); refreshAll(); }
  const restoreTo = (i) => { hi = i; doc = structuredClone(hist[hi]); sel = new Set([...sel].filter((id) => doc.events.some((e) => e.id === id))); if (!doc.events.some((e) => e.id === cur)) cur = doc.events[0]?.id ?? null; touch(); refreshAll(); };
  const undo = () => hi > 0 && restoreTo(hi - 1), redo = () => hi < hist.length - 1 && restoreTo(hi + 1);
  ctx.setGuard(() => dirty);
  ctx.cleanup(() => { clearTimeout(draftTimer); if (dirty) saveDraft(); });

  // ---------- elements ----------
  const status = h("span", { class: "sed-status" });
  const mk = (label, fn, title, cls = "") => h("button", { class: cls, title: title || label, onclick: fn }, label);
  const undoB = mk("↶", undo, t("Undo"), "ic"), redoB = mk("↷", redo, t("Redo"), "ic");
  const encSel = h("select", { "aria-label": t("Encoding"), title: t("Encoding"), onchange: async () => {
    if (dirty && !(await ask({ title: t("Change encoding"), message: t("Reading the file with another encoding discards your edits. Continue?"), confirm: msg("Continue"), danger: true }))) { encSel.value = encPick; return; }
    encPick = encSel.value; load(encPick); refreshAll(); toast(t("Re-read as {enc}", { enc: decoded.encoding }));
  } }, h("option", { value: "auto" }, t("Auto") + " (" + decoded.encoding + ")"), S.ENCODINGS.map(([v, l]) => h("option", { value: v }, l)));
  const toolbar = h("div", { class: "vb sedbar" },
    mk(t("Save"), () => doSave(), t("Save changes (Ctrl+S)"), "pri"), mk(t("Save as…"), () => saveAs()), undoB, redoB,
    mk("＋ " + t("Line"), () => addLine(), t("Insert a line after the selected one")), mk(t("Delete"), () => delLines(), t("Delete selected lines"), "danger"), mk(t("Duplicate"), () => dupLines()), mk(t("Split"), () => splitLine(), t("Split at the video time and the text cursor")), mk(t("Merge"), () => mergeLines()),
    mk(t("Shift…"), () => shiftDlg()), mk(t("Sync…"), () => syncDlg(), t("Retime from two reference lines")), mk("FPS…", () => fpsDlg()), mk(t("Find…"), () => findDlg()), mk("ş→ș", () => fixRo(), t("Replace cedilla letters ş ţ with ș ț")),
    mk(t("Styles…"), () => stylesDlg()), mk(t("Info…"), () => infoDlg()), mk(t("Check"), () => qcDlg(), t("Find timing and reading-speed problems")), encSel, status);

  // video + transport
  const vbox = h("div", { class: "sed-video" }), picker = h("input", { type: "file", accept: "video/*,audio/*", hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) attachVideo(f, f.name); } });
  const ph = () => { vbox.textContent = ""; put(vbox, h("div", { class: "sed-ph" }, h("p", {}, t("Load a video or audio file to time the subtitles against it.")), h("div", { class: "row" }, h("button", { class: "pri", onclick: chooseVideo }, t("Choose from library…")), h("button", { onclick: () => picker.click() }, t("Open file…")))), picker); };
  const playB = h("button", { class: "ic", onclick: () => togglePlay(), "aria-label": t("Play / pause") }, "▶"), timeL = h("span", { class: "sed-time" }, "0:00:00.000");
  const scrub = h("input", { type: "range", min: 0, max: 1000, value: 0, step: 10, "aria-label": t("Seek"), oninput: () => seek(+scrub.value) });
  const speed = h("select", { "aria-label": t("Playback speed"), onchange: () => { if (vid) vid.playbackRate = +speed.value; } }, [0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => h("option", { value: v, selected: v === 1 }, v + "×")));
  const transport = h("div", { class: "sed-transport" }, h("div", { class: "row", style: "justify-content:flex-start" }, playB, timeL, speed, h("button", { class: "ic", title: t("Full screen"), "aria-label": t("Full screen"), onclick: () => vbox.requestFullscreen?.() }, "⛶")), scrub,
    h("div", { class: "row", style: "justify-content:flex-start" }, h("button", { onclick: () => setTimeFromVideo("start"), title: t("Set start from video time (F2)") }, t("Set start") + " F2"), h("button", { onclick: () => setTimeFromVideo("end"), title: t("Set end from video time (F3)") }, t("Set end") + " F3"), h("button", { onclick: () => playLine(), title: t("Play the selected line (F5)") }, "▶ " + t("Line") + " F5"), h("label", { style: "display:flex;gap:6px;align-items:center" }, h("input", { type: "checkbox", id: "follow", checked: true }), t("Follow"))));
  const wave = h("canvas", { class: "sed-wave", "aria-label": t("Timeline: click to seek, drag the handles of the selected line to retime it") });
  const left = h("div", { class: "sed-left" }, vbox, transport, wave);

  // edit box
  const tcIn = (key) => { const i = h("input", { type: "text", class: "tc", "aria-label": t(key === "start" ? "Start" : "End"), onchange: () => setTime(key, i) }); return i; };
  const fStart = tcIn("start"), fEnd = tcIn("end");
  const fDur = h("input", { type: "text", class: "tc", "aria-label": t("Duration"), onchange: () => { const v = S.parseTime(fDur.value); if (Number.isNaN(v)) { toast(t("Invalid time")); loadEdit(); return; } mutate(() => { const e = ev(); if (e) e.end = e.start + v; }); } });
  const fStyle = h("select", { "aria-label": t("Style"), onchange: () => mutate(() => { const e = ev(); if (e) e.style = fStyle.value; }) });
  const fLayer = h("input", { type: "number", class: "tc", min: 0, "aria-label": t("Layer"), onchange: () => mutate(() => { const e = ev(); if (e) e.layer = Math.max(0, +fLayer.value || 0); }) });
  const fComment = h("input", { type: "checkbox", "aria-label": t("Comment"), onchange: () => mutate(() => { const e = ev(); if (e) e.comment = fComment.checked; }) });
  const area = h("textarea", { class: "sed-text", spellcheck: true, "aria-label": t("Subtitle text"), rows: 3 }), info = h("small", { class: "sed-info" });
  let typing; area.addEventListener("input", () => { const e = ev(); if (!e) return; e.text = fromArea(area.value); touch(); updateInfo(); overlay?.refresh(vid ? vid.currentTime * 1000 : 0); paintRow(e); clearTimeout(typing); typing = setTimeout(() => { snap(); refreshIssues(); updateButtons(); }, 700); });
  const wrap = (open, close) => { const a = area.selectionStart, b = area.selectionEnd, v = area.value; area.value = v.slice(0, a) + open + v.slice(a, b) + close + v.slice(b); area.focus(); area.setSelectionRange(a + open.length, b + open.length); area.dispatchEvent(new Event("input")); };
  const tags = h("div", { class: "row", style: "justify-content:flex-start" }, h("button", { class: "ic", onclick: () => wrap("{\\b1}", "{\\b0}"), "aria-label": t("Bold") }, "B"), h("button", { class: "ic", onclick: () => wrap("{\\i1}", "{\\i0}"), "aria-label": t("Italic") }, "I"), h("button", { class: "ic", onclick: () => wrap("{\\u1}", "{\\u0}"), "aria-label": t("Underline") }, "U"), h("button", { class: "ic", onclick: () => wrap("{\\s1}", "{\\s0}"), "aria-label": t("Strikethrough") }, "S"), h("button", { onclick: () => wrap("{\\an8}", "") }, t("Top")));
  const editBox = h("div", { class: "sed-edit" },
    h("div", { class: "sed-times" }, h("label", {}, t("Start"), fStart), h("label", {}, t("End"), fEnd), h("label", {}, t("Duration"), fDur), h("label", {}, t("Style"), fStyle), h("label", { class: "sed-layer" }, t("Layer"), fLayer), h("label", { class: "sed-cm" }, fComment, t("Comment"))), area, h("div", { class: "row", style: "justify-content:space-between" }, tags, info));

  // grid (virtual list)
  const grid = h("div", { class: "sgrid", tabindex: 0, role: "grid", "aria-label": t("Subtitle lines") }), inner = h("div", { class: "sin" }); grid.append(inner);
  let first = -1;
  function rowEl(e, i) {
    const bad = issues.get(e.id) || [], r = h("div", { class: "srow" + (sel.has(e.id) ? " sel" : "") + (e.id === cur ? " cur" : "") + (e.comment ? " cm" : "") + (e.id === activeId ? " act" : ""), role: "row", "data-id": e.id, style: `transform:translateY(${i * ROW}px);height:${ROW}px`, onclick: (evt) => pick(e, evt) },
      h("span", { class: "c-n" }, i + 1), h("span", { class: "c-s" }, T(e.start)), h("span", { class: "c-e" }, T(e.end)), h("span", { class: "c-d" }, ((e.end - e.start) / 1000).toFixed(2)),
      h("span", { class: "c-c" + (bad.includes("cps") ? " bad" : "") }, S.cps(e).toFixed(1)), h("span", { class: "c-y" }, e.style), h("span", { class: "c-t" + (bad.some((k) => k !== "cps") ? " warnt" : "") }, S.plainText(e.text).replace(/\n/g, " ⏎ ")));
    return r;
  }
  function drawGrid(force) {
    const n = doc.events.length; inner.style.height = n * ROW + "px";
    const top = grid.scrollTop, vh = grid.clientHeight || 400, a = Math.max(0, Math.floor(top / ROW) - 8), b = Math.min(n, Math.ceil((top + vh) / ROW) + 8);
    if (!force && a === first) return; first = a; inner.replaceChildren(...doc.events.slice(a, b).map((e, k) => rowEl(e, a + k)));
  }
  const paintRow = (e) => { const i = doc.events.indexOf(e), el = inner.querySelector(`[data-id="${e.id}"]`); if (el) el.replaceWith(rowEl(e, i)); };
  grid.addEventListener("scroll", () => drawGrid(false), { passive: true });
  function pick(e, evt) {
    if (evt?.shiftKey && cur != null) { const a = doc.events.findIndex((x) => x.id === cur), b = doc.events.indexOf(e); sel = new Set(doc.events.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id)); }
    else if (evt?.ctrlKey || evt?.metaKey) { sel.has(e.id) ? sel.delete(e.id) : sel.add(e.id); cur = e.id; }
    else { sel = new Set([e.id]); cur = e.id; }
    if (vid && !evt?.ctrlKey && !evt?.shiftKey) vid.currentTime = e.start / 1000;
    drawGrid(true); loadEdit(); drawWave();
  }
  const scrollTo = (id) => { const i = doc.events.findIndex((e) => e.id === id); if (i < 0) return; const top = i * ROW; if (top < grid.scrollTop || top > grid.scrollTop + grid.clientHeight - ROW) grid.scrollTop = Math.max(0, top - grid.clientHeight / 2); };
  grid.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return; e.preventDefault();
    const i = doc.events.findIndex((x) => x.id === cur), n = doc.events[i + (e.key === "ArrowDown" ? 1 : -1)]; if (n) { pick(n, e); scrollTo(n.id); }
  });

  // ---------- refresh ----------
  function refreshIssues() { issues = new Map(); for (const i of S.qc(doc)) { const a = issues.get(i.id) || []; a.push(i.kind); issues.set(i.id, a); } }
  function updateInfo() { const e = ev(); if (!e) { info.textContent = ""; return; } const p = S.plainText(e.text); info.textContent = t("{n} characters", { n: p.replace(/\n/g, "").length }) + " · " + S.cps(e).toFixed(1) + " " + t("chars/s"); }
  function loadEdit() {
    const e = ev(), on = !!e; for (const x of [fStart, fEnd, fDur, fStyle, fLayer, fComment, area]) x.disabled = !on;
    fStyle.replaceChildren(...doc.styles.map((s) => h("option", { value: s.name, selected: e && s.name === e.style }, s.name)));
    fLayer.parentElement.hidden = doc.format !== "ass"; fComment.parentElement.hidden = doc.format !== "ass";
    if (!e) { for (const x of [fStart, fEnd, fDur]) x.value = ""; area.value = ""; updateInfo(); return; }
    fStart.value = T(e.start); fEnd.value = T(e.end); fDur.value = ((e.end - e.start) / 1000).toFixed(3); fLayer.value = e.layer; fComment.checked = e.comment;
    if (document.activeElement !== area) area.value = toArea(e.text); updateInfo();
  }
  function updateButtons() { undoB.disabled = hi === 0; redoB.disabled = hi >= hist.length - 1; status.textContent = t("{n} lines", { n: doc.events.length }) + (issues.size ? " · ⚠ " + t("{n} with issues", { n: issues.size }) : "") + (dirty ? " · ● " + t("unsaved") : "") + " · " + doc.format.toUpperCase(); }
  function refreshAll() { refreshIssues(); drawGrid(true); loadEdit(); drawWave(); updateButtons(); overlay?.setDoc(doc); overlay?.refresh(vid ? vid.currentTime * 1000 : 0); }

  // ---------- operations ----------
  const setTime = (key, input) => { const v = S.parseTime(input.value); if (Number.isNaN(v)) { toast(t("Invalid time")); loadEdit(); return; } mutate(() => { const e = ev(); if (!e) return; e[key] = v; if (e.end < e.start) { if (key === "start") e.end = e.start; else e.start = e.end; } }); };
  const nowMs = () => (vid ? Math.round(vid.currentTime * 1000) : null);
  function setTimeFromVideo(key) { const n = nowMs(); if (n == null) { toast(t("Load a video first.")); return; } mutate(() => { const e = ev(); if (!e) return; e[key] = n; if (e.end < e.start) { if (key === "start") e.end = e.start + 2000; else e.start = e.end; } }); }
  const addLine = () => mutate(() => { const n = nowMs(), e = S.insertAfter(doc, cur, n == null ? {} : { start: n, end: n + 2000 }); cur = e.id; sel = new Set([e.id]); S.sortEvents(doc); });
  const delLines = () => { if (sel.size) mutate(() => S.remove(doc, sel)); };
  const dupLines = () => sel.size && mutate(() => { const m = S.duplicate(doc, sel); sel = new Set(m.map((x) => x.id)); cur = m.at(-1).id; });
  function splitLine() { const e = ev(); if (!e) return; const n = nowMs(), time = n != null && n > e.start && n < e.end ? n : Math.round((e.start + e.end) / 2), idx = document.activeElement === area ? area.value.slice(0, area.selectionStart).replace(/\n/g, "\\N").length : undefined; mutate(() => { const s = S.split(doc, e.id, time, idx); if (s) { cur = s.id; sel = new Set([s.id]); } }); }
  const mergeLines = () => sel.size > 1 ? mutate(() => { const m = S.merge(doc, sel); if (m) { cur = m.id; sel = new Set([m.id]); } }) : toast(t("Select two or more lines to merge."));
  const scopeIds = (scope) => scope === "all" ? null : scope === "sel" ? new Set(sel) : new Set(doc.events.slice(Math.max(0, doc.events.findIndex((e) => e.id === cur))).map((e) => e.id));
  const SCOPES = () => [["all", t("All lines")], ["sel", t("Selected lines")], ["from", t("From the selected line to the end")]];
  async function shiftDlg() {
    const v = await form({ title: t("Shift times"), fields: [{ key: "ms", label: t("Shift by (milliseconds)"), type: "number", value: 0, step: 100, hint: t("Negative values make lines earlier.") }, { key: "scope", label: t("Apply to"), type: "select", options: SCOPES(), value: sel.size > 1 ? "sel" : "all" }], confirm: msg("Shift") });
    if (v && v.ms) mutate(() => S.shift(doc, scopeIds(v.scope), Math.round(v.ms)));
  }
  async function syncDlg() {
    const ev0 = doc.events.filter((e) => !e.comment); if (ev0.length < 2) { toast(t("Need at least two lines.")); return; }
    const opts = ev0.map((e, i) => [e.id, `${doc.events.indexOf(e) + 1}. ${S.plainText(e.text).slice(0, 28)}`]);
    const v = await form({ title: t("Retime from two reference lines"), fields: [{ type: "note", label: t("Tell OmniView when two lines should really start; every other line is stretched to fit.") },
      { key: "a", label: t("First line"), type: "select", options: opts, value: ev0[0].id }, { key: "at", label: t("should start at"), type: "text", value: T(ev0[0].start) },
      { key: "b", label: t("Second line"), type: "select", options: opts, value: ev0.at(-1).id }, { key: "bt", label: t("should start at"), type: "text", value: T(ev0.at(-1).start) }],
      validate: (x) => (Number.isNaN(S.parseTime(x.at)) || Number.isNaN(S.parseTime(x.bt)) ? t("Invalid time") : +x.a === +x.b ? t("Choose two different lines.") : "") , confirm: msg("Retime") });
    if (!v) return; const A = doc.events.find((e) => e.id === +v.a), B = doc.events.find((e) => e.id === +v.b);
    try { mutate(() => S.retimeLinear(doc, null, { from: A.start, to: S.parseTime(v.at) }, { from: B.start, to: S.parseTime(v.bt) })); } catch { toast(t("The two reference lines start at the same time.")); }
  }
  async function fpsDlg() {
    const o = FPS.map((f) => [f, String(f)]);
    const v = await form({ title: t("Change frame rate"), fields: [{ type: "note", label: t("Use this when the subtitles were made for a video with a different frame rate (for example 25 → 23.976).") }, { key: "from", label: t("Subtitles were made for"), type: "select", options: o, value: 25 }, { key: "to", label: t("Video frame rate"), type: "select", options: o, value: 23.976 }], confirm: msg("Apply") });
    if (v && +v.from !== +v.to) mutate(() => S.scaleFps(doc, null, +v.from, +v.to));
  }
  async function findDlg() {
    const v = await form({ title: t("Find and replace"), fields: [{ key: "find", label: t("Find"), type: "text", value: "" }, { key: "replace", label: t("Replace with"), type: "text", value: "" }, { key: "matchCase", label: t("Match case"), type: "checkbox" }, { key: "wholeWord", label: t("Whole words"), type: "checkbox" }, { key: "regex", label: t("Regular expression"), type: "checkbox" }, { key: "scope", label: t("Apply to"), type: "select", options: SCOPES(), value: "all" }],
      validate: (x) => { if (!x.find) return t("Enter text to find."); if (x.regex) { try { new RegExp(x.find); } catch { return t("Invalid regular expression."); } } return ""; }, confirm: msg("Replace all") });
    if (!v) return; let n = 0; mutate(() => { n = S.findReplace(doc, v, scopeIds(v.scope)); }); toast(t("{n} replacement(s)", { n }));
  }
  const fixRo = () => { let n = 0; mutate(() => { n = S.normalizeRomanian(doc); }); toast(n ? t("Fixed {n} letter(s).", { n }) : t("No ş / ţ letters found.")); };
  async function infoDlg() {
    const v = await form({ title: t("Script info"), fields: [{ key: "Title", label: t("Title"), type: "text", value: doc.info.Title || "" }, { key: "PlayResX", label: t("Video width (PlayResX)"), type: "number", value: +doc.info.PlayResX || 1920, min: 1 }, { key: "PlayResY", label: t("Video height (PlayResY)"), type: "number", value: +doc.info.PlayResY || 1080, min: 1, hint: t("Font sizes and positions are relative to this resolution.") }] });
    if (v) mutate(() => { doc.info.Title = v.Title; doc.info.PlayResX = String(Math.round(v.PlayResX)); doc.info.PlayResY = String(Math.round(v.PlayResY)); });
  }
  async function stylesDlg() {
    const NEW = "__new";
    const pickS = await form({ title: t("Styles"), fields: [{ key: "s", label: t("Style"), type: "select", options: [...doc.styles.map((s) => [s.name, s.name]), [NEW, "＋ " + t("New style…")]], value: ev()?.style || doc.styles[0].name }], confirm: msg("Edit") });
    if (!pickS) return;
    const base = pickS.s === NEW ? { ...S.defaultStyle("Style " + (doc.styles.length + 1)) } : doc.styles.find((s) => s.name === pickS.s);
    const f = (key, label, type, extra = {}) => ({ key, label, type, value: base[key], ...extra });
    const v = await form({ title: t("Style"), wide: true, fields: [f("name", t("Name"), "text"), f("font", t("Font"), "text"), f("size", t("Size"), "number", { min: 1 }),
      { key: "primary", label: t("Text color"), type: "color", value: hex(base.primary) }, { key: "outline", label: t("Outline color"), type: "color", value: hex(base.outline) }, { key: "back", label: t("Shadow color"), type: "color", value: hex(base.back) },
      f("bold", t("Bold"), "checkbox"), f("italic", t("Italic"), "checkbox"), f("underline", t("Underline"), "checkbox"), f("strike", t("Strikethrough"), "checkbox"),
      f("outlineW", t("Outline width"), "number", { min: 0, step: 0.5 }), f("shadow", t("Shadow depth"), "number", { min: 0, step: 0.5 }),
      { key: "alignment", label: t("Alignment"), type: "select", value: base.alignment, options: [[7, "↖ 7"], [8, "↑ 8"], [9, "↗ 9"], [4, "← 4"], [5, "● 5"], [6, "→ 6"], [1, "↙ 1"], [2, "↓ 2"], [3, "↘ 3"]] },
      f("marginL", t("Left margin"), "number", { min: 0 }), f("marginR", t("Right margin"), "number", { min: 0 }), f("marginV", t("Vertical margin"), "number", { min: 0 }),
      ...(pickS.s === NEW || doc.styles.length < 2 ? [] : [{ key: "del", label: t("Delete this style"), type: "checkbox", hint: t("Lines using it move to the first style.") }])],
      validate: (x) => (!x.del && !x.name.trim() ? t("The style needs a name.") : !x.del && doc.styles.some((s) => s !== base && s.name === x.name.trim()) ? t("A style with this name already exists.") : ""), confirm: msg("Apply") });
    if (!v) return;
    mutate(() => {
      if (v.del) { const i = doc.styles.indexOf(base), fallback = doc.styles.find((s) => s !== base).name; for (const e of doc.events) if (e.style === base.name) e.style = fallback; doc.styles.splice(i, 1); return; }
      const old = base.name, st = pickS.s === NEW ? base : base;
      Object.assign(st, { name: v.name.trim(), font: v.font, size: v.size, bold: +v.bold, italic: +v.italic, underline: +v.underline, strike: +v.strike, outlineW: v.outlineW, shadow: v.shadow, alignment: +v.alignment, marginL: v.marginL, marginR: v.marginR, marginV: v.marginV,
        primary: S.cssToAssColor(v.primary, st.primary.slice(2, 4) || "00"), outline: S.cssToAssColor(v.outline, st.outline.slice(2, 4) || "00"), back: S.cssToAssColor(v.back, st.back.slice(2, 4) || "00") });
      if (pickS.s === NEW) doc.styles.push(st); else if (old !== st.name) for (const e of doc.events) if (e.style === old) e.style = st.name;
    });
  }
  function qcDlg() {
    const list = S.qc(doc), box = h("div", { class: "qc" });
    const draw = () => { box.textContent = ""; const l = S.qc(doc); if (!l.length) { put(box, h("p", {}, "✓ " + t("No problems found."))); return; } for (const i of l.slice(0, 300)) { const n = doc.events.findIndex((e) => e.id === i.id) + 1; put(box, h("button", { class: "ghost qcrow", onclick: () => { cur = i.id; sel = new Set([i.id]); const e = ev(); if (vid && e) vid.currentTime = e.start / 1000; scrollTo(i.id); drawGrid(true); loadEdit(); drawWave(); } }, h("b", {}, "#" + n), " ", t(QC_TEXT[i.kind] || i.msg), i.detail ? " (" + i.detail + ")" : "")); } };
    draw();
    form({ title: t("Check ({n} issues)", { n: list.length }), fields: [{ type: "node", node: box }, { type: "node", node: h("div", { class: "row", style: "justify-content:flex-start" }, h("button", { onclick: () => { let n = 0; mutate(() => { n = S.fixOverlaps(doc); }); toast(t("Fixed {n} overlap(s).", { n })); draw(); } }, t("Fix overlaps")), h("button", { onclick: () => { mutate(() => S.sortEvents(doc)); draw(); } }, t("Sort by time"))) }], cancel: null, confirm: msg("Close") });
  }

  // ---------- saving ----------
  function build(format, enc, bom) {
    const out = S.serialize(doc, format), e = S.encodeText(out.text, enc, { bom });
    return { blob: new Blob([e.bytes], { type: "text/plain" }), lost: out.lost, lostChars: e.lost };
  }
  const warn = (r) => { if (r.lost) toast(t("{n} line(s) lost positioning or font tags that this format cannot store.", { n: r.lost })); else if (r.lostChars) toast(t("{n} character(s) cannot be stored in this encoding and became “?”.", { n: r.lostChars })); };
  const currentEnc = () => (decoded.encoding === "utf-16le" || decoded.encoding === "utf-16be" ? decoded.encoding : decoded.encoding);
  async function doSave() {
    const r = build(rec.fmt, currentEnc(), false);
    rec.blob = new Blob([r.blob], { type: rec.blob.type }); rec.size = rec.blob.size;
    await ctx.saveView(); dirty = false; try { localStorage.removeItem(draftKey(rec.id)); } catch { /* ignore */ }
    updateButtons(); toast(t("Saved to your library")); warn(r);
  }
  async function saveAs() {
    const v = await form({ title: t("Save as"), fields: [{ key: "format", label: t("Format"), type: "select", options: [["srt", "SubRip (.srt)"], ["vtt", "WebVTT (.vtt)"], ["ass", "Advanced SubStation Alpha (.ass)"]], value: rec.fmt }, { key: "enc", label: t("Encoding"), type: "select", options: S.ENCODINGS, value: "utf-8" }, { key: "bom", label: t("Add a byte-order mark (UTF-8 BOM)"), type: "checkbox" }, { key: "to", label: t("Save to"), type: "select", options: [["download", t("Download")], ["library", t("A new item in the library")]], value: "download" }], confirm: msg("Save") });
    if (!v) return; const r = build(v.format, v.enc, v.bom), name = rec.name.replace(/\.[^.]+$/, "") + "." + v.format;
    if (v.to === "library") await ctx.addCopy(name, r.blob); else ctx.save(name, r.blob);
    warn(r);
  }

  // ---------- video ----------
  function setPlaying(p) { playB.textContent = p ? "❚❚" : "▶"; }
  const togglePlay = () => { if (!vid) return; stopAt = null; vid.paused ? vid.play().catch(() => {}) : vid.pause(); };
  const seek = (ms) => { if (vid) vid.currentTime = ms / 1000; else { winCenter = ms / 1000; drawWave(); } };
  function playLine() { const e = ev(); if (!e || !vid) { toast(t("Load a video first.")); return; } vid.currentTime = e.start / 1000; stopAt = e.end; vid.play().catch(() => {}); }
  let winCenter = 0, raf = 0;
  const tick = () => {
    raf = 0; if (!vid) return;
    const ms = vid.currentTime * 1000; timeL.textContent = T(ms) + (Number.isFinite(vid.duration) ? " / " + T(vid.duration * 1000) : ""); scrub.value = ms;
    overlay.update(ms);
    if (stopAt != null && ms >= stopAt) { vid.pause(); stopAt = null; }
    const a = doc.events.find((e) => !e.comment && e.start <= ms && ms < e.end), id = a ? a.id : null;
    if (id !== activeId) { activeId = id; drawGrid(true); if (id != null && document.getElementById("follow")?.checked && !vid.paused) scrollTo(id); }
    drawWave(); if (!vid.paused) raf = requestAnimationFrame(tick);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  async function attachVideo(src, name) {
    const blob = src instanceof Blob ? src : null; if (!blob) return;
    vbox.textContent = ""; vid?.pause(); overlay?.destroy();
    vid = h("video", { playsinline: true, preload: "auto", src: ctx.obj(blob), "aria-label": name }); put(vbox, vid, picker);
    overlay = new SubOverlay(vbox, vid); overlay.setDoc(doc);
    vid.addEventListener("loadedmetadata", () => { scrub.max = Number.isFinite(vid.duration) ? vid.duration * 1000 : 3600000; kick(); });
    vid.addEventListener("play", () => { setPlaying(true); kick(); }); vid.addEventListener("pause", () => { setPlaying(false); kick(); });
    for (const n of ["seeked", "timeupdate", "loadeddata"]) vid.addEventListener(n, kick);
    vid.addEventListener("error", () => { toast(t("The browser cannot play this video.")); });
    vid.addEventListener("click", togglePlay); ctx.cleanup(() => { vid?.pause(); cancelAnimationFrame(raf); });
    new ResizeObserver(() => overlay?.refresh(vid.currentTime * 1000)).observe(vbox);
    peaks = null; drawWave();
    bar(-1); try { peaks = await computePeaks(blob); } catch { peaks = null; } finally { bar(null); } drawWave();
  }
  async function chooseVideo() {
    const media = L.state.items.filter((i) => !i.trashed && (i.cat === "vid" || i.cat === "aud"));
    if (!media.length) { picker.click(); return; }
    const base = (n) => n.replace(/\.[^.]+$/, "").toLowerCase(), guess = media.find((m) => base(m.name) === base(rec.name));
    const v = await ask({ title: t("Choose a video"), select: [...media.map((m) => ({ v: String(m.id), l: m.name })), { v: "__file", l: t("Open file…") }], confirm: msg("Open") });
    if (v == null) return; if (v === "__file") { picker.click(); return; }
    const m = L.byId(+v); if (m) attachVideo(m.blob, m.name); void guess;
  }

  // ---------- timeline ----------
  const dpr = Math.min(devicePixelRatio || 1, 2); let drag = null;
  function drawWave() {
    const W = wave.clientWidth, H = wave.clientHeight; if (!W || !H) return;
    if (wave.width !== Math.round(W * dpr)) { wave.width = Math.round(W * dpr); wave.height = Math.round(H * dpr); }
    const g = wave.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const cs = getComputedStyle(document.documentElement), br = cs.getPropertyValue("--br").trim() || "#4b3df0", mut = cs.getPropertyValue("--mut").trim() || "#888", ln = cs.getPropertyValue("--ln").trim() || "#ddd";
    const e = ev(), c = vid ? vid.currentTime : e ? e.start / 1000 : winCenter, t0 = Math.max(0, c - winSec / 2), px = (s) => ((s - t0) / winSec) * W;
    g.fillStyle = mut; g.globalAlpha = 0.65;
    if (peaks) for (let x = 0; x < W; x += 1) { const s = t0 + (x / W) * winSec, p = peaks[Math.floor(s * 100)] || 0, hh = Math.max(1, p * (H - 24)); g.fillRect(x, (H - hh) / 2 + 6, 1, hh); }
    g.globalAlpha = 1;
    for (const ev2 of doc.events) { if (ev2.comment || ev2.end / 1000 < t0 || ev2.start / 1000 > t0 + winSec) continue; const x1 = px(ev2.start / 1000), x2 = px(ev2.end / 1000), on = sel.has(ev2.id); g.fillStyle = br; g.globalAlpha = on ? 0.3 : 0.14; g.fillRect(x1, 0, Math.max(2, x2 - x1), H); g.globalAlpha = 1; if (on) { g.fillStyle = br; g.fillRect(x1 - 1, 0, 3, H); g.fillRect(x2 - 1, 0, 3, H); } }
    g.strokeStyle = ln; g.beginPath(); for (let s = Math.ceil(t0); s < t0 + winSec; s++) { const x = px(s); g.moveTo(x, H - 8); g.lineTo(x, H); } g.stroke();
    if (vid) { g.fillStyle = "#e5484d"; g.fillRect(px(c) - 1, 0, 2, H); }
    if (!peaks && vid) { g.fillStyle = mut; g.font = "12px sans-serif"; g.fillText(t("No waveform (file too large or audio cannot be decoded)"), 8, 16); }
  }
  const timeAt = (x) => { const c = vid ? vid.currentTime : ev() ? ev().start / 1000 : winCenter, t0 = Math.max(0, c - winSec / 2); return t0 + (x / wave.clientWidth) * winSec; };
  wave.addEventListener("pointerdown", (e) => {
    const r = wave.getBoundingClientRect(), x = e.clientX - r.left, c = ev(), px = (s) => ((s - Math.max(0, (vid ? vid.currentTime : c ? c.start / 1000 : winCenter) - winSec / 2)) / winSec) * r.width;
    if (c && Math.abs(px(c.start / 1000) - x) < 12) drag = { which: "start" }; else if (c && Math.abs(px(c.end / 1000) - x) < 12) drag = { which: "end" };
    else { const s = timeAt(x); if (vid) vid.currentTime = s; const hit = doc.events.find((q) => !q.comment && q.start / 1000 <= s && s < q.end / 1000); if (hit) pick(hit, {}); winCenter = s; drawWave(); }
    if (drag) wave.setPointerCapture?.(e.pointerId);
  });
  wave.addEventListener("pointermove", (e) => {
    if (!drag) return; const r = wave.getBoundingClientRect(), s = Math.max(0, Math.round(timeAt(e.clientX - r.left) * 100) * 10), c = ev(); if (!c) return;
    c[drag.which] = s; if (c.end < c.start) { if (drag.which === "start") c.end = s; else c.start = s; } drag.moved = true; loadEdit(); drawWave(); paintRow(c); overlay?.refresh(vid ? vid.currentTime * 1000 : 0);
  });
  const endDrag = () => { if (drag?.moved) { snap(); touch(); refreshAll(); } drag = null; }; wave.addEventListener("pointerup", endDrag); wave.addEventListener("pointercancel", endDrag);
  wave.addEventListener("wheel", (e) => { e.preventDefault(); winSec = Math.min(120, Math.max(2, winSec * (e.deltaY > 0 ? 1.25 : 0.8))); drawWave(); }, { passive: false });
  new ResizeObserver(() => drawWave()).observe(wave);

  // ---------- keys ----------
  const onKey = (e) => {
    if (!ctx.alive() || document.querySelector(".dlg-b")) return;
    const tgt = e.target.tagName, typing = /INPUT|TEXTAREA|SELECT/.test(tgt), mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    const eat = () => { e.preventDefault(); e.stopPropagation(); };
    if (e.key === "F2") { eat(); setTimeFromVideo("start"); } else if (e.key === "F3") { eat(); setTimeFromVideo("end"); } else if (e.key === "F5") { eat(); playLine(); }
    else if (mod && k === "s") { eat(); doSave(); }
    else if (mod && e.key === "Enter" && tgt === "TEXTAREA") { eat(); const n = doc.events[doc.events.findIndex((x) => x.id === cur) + 1]; if (n) { pick(n, {}); scrollTo(n.id); area.focus(); } }
    else if (!typing && mod && k === "z") { eat(); e.shiftKey ? redo() : undo(); } else if (!typing && mod && k === "y") { eat(); redo(); }
    else if (!typing && e.key === " ") { eat(); togglePlay(); }
    else if (!typing && e.key === "Delete") { eat(); delLines(); }
    else if (!typing && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { eat(); if (vid) vid.currentTime += e.key === "ArrowRight" ? 1 : -1; }
  };
  document.addEventListener("keydown", onKey, true); ctx.cleanup(() => document.removeEventListener("keydown", onKey, true));

  // ---------- assemble ----------
  const right = h("div", { class: "sed-right" }, editBox, grid);
  const draft = (() => { try { const d = JSON.parse(localStorage.getItem(draftKey(rec.id)) || "null"); return d && d.text && d.text !== S.serialize(doc, "ass").text ? d : null; } catch { return null; } })();
  const banner = draft ? h("div", { class: "warn", style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap" }, t("An unsaved draft from a previous session was found."),
    h("button", { onclick: () => { doc = S.parse(draft.text, "ass"); doc.format = rec.fmt; hist = [structuredClone(doc)]; hi = 0; cur = doc.events[0]?.id ?? null; sel = new Set(cur != null ? [cur] : []); dirty = true; banner.remove(); refreshAll(); } }, t("Restore draft")),
    h("button", { onclick: () => { try { localStorage.removeItem(draftKey(rec.id)); } catch { /* ignore */ } banner.remove(); } }, t("Discard"))) : null;
  body.textContent = ""; body.style.flexDirection = "column";
  const root = h("div", { class: "sed", "data-ownkeys": "" }, toolbar, banner, h("div", { class: "sed-main" }, left, right));
  put(body, root);
  ph(); refreshAll();
  // open with a video: from the media viewer, or a library video with the same name
  const opt = ctx.opts?.video; const base = (n) => n.replace(/\.[^.]+$/, "").toLowerCase();
  const match = opt || L.state.items.find((i) => !i.trashed && (i.cat === "vid" || i.cat === "aud") && base(i.name) === base(rec.name));
  if (match) attachVideo(match.blob, match.name);
}
