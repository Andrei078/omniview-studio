// Subtitle core (no DOM): SRT / WebVTT / ASS-SSA parsing and writing, encodings, timing operations and quality checks.
// Internal text uses ASS conventions: "\N" is a line break and {\i1} {\b1} {\u1} {\s1} {\c&HBBGGRR&} are inline styling.

export const FORMATS = ["srt", "vtt", "ass"];
export const ENCODINGS = [["utf-8", "UTF-8"], ["windows-1250", "Windows-1250 (Central European, Romanian)"], ["windows-1252", "Windows-1252 (Western European)"], ["iso-8859-2", "ISO-8859-2 (Central European)"], ["windows-1251", "Windows-1251 (Cyrillic)"], ["utf-16le", "UTF-16 LE"], ["utf-16be", "UTF-16 BE"]];

// ---------- encodings ----------
const RO_FIX = { "ș": "ş", "ț": "ţ", "Ș": "Ş", "Ț": "Ţ" }; // comma-below letters do not exist in the old single-byte code pages
const maps = {};
function byteMap(enc) {
  if (maps[enc]) return maps[enc];
  const d = new TextDecoder(enc), m = new Map();
  for (let b = 0; b < 256; b++) { const ch = d.decode(new Uint8Array([b])); if (ch !== "\uFFFD" && !m.has(ch)) m.set(ch, b); }
  return (maps[enc] = m);
}

/** Decode subtitle bytes. enc = "auto" or one of ENCODINGS. Returns { text, encoding }. */
export function decodeBytes(bytes, enc = "auto") {
  if (enc === "auto") {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) enc = "utf-16le";
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) enc = "utf-16be";
    else {
      try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "utf-8" }; } catch { /* not UTF-8 */ }
      // Legacy files: Romanian-specific bytes (ă â î ş ţ) favour Windows-1250, French/Spanish/German letters Windows-1252.
      let ro = 0, we = 0;
      for (const b of bytes) { if (b === 0xe3 || b === 0xba || b === 0xfe || b === 0xaa || b === 0xde || b === 0xc3) ro++; else if (b === 0xe9 || b === 0xe8 || b === 0xe0 || b === 0xe7 || b === 0xf1 || b === 0xfc || b === 0xf6 || b === 0xe4 || b === 0xdf) we++; }
      enc = we > ro ? "windows-1252" : "windows-1250";
    }
  }
  return { text: new TextDecoder(enc).decode(bytes), encoding: enc };
}

/** Encode text. Returns { bytes, lost } where lost counts characters the encoding cannot represent (written as "?"). */
export function encodeText(text, enc = "utf-8", { bom = false } = {}) {
  if (enc === "utf-8") { const b = new TextEncoder().encode(text); return { bytes: bom ? Uint8Array.from([0xef, 0xbb, 0xbf, ...b]) : b, lost: 0 }; }
  if (enc === "utf-16le" || enc === "utf-16be") {
    const le = enc === "utf-16le", out = new Uint8Array((text.length + 1) * 2); let o = 0;
    const put = (c) => { if (le) { out[o++] = c & 255; out[o++] = c >> 8; } else { out[o++] = c >> 8; out[o++] = c & 255; } };
    put(0xfeff); for (let i = 0; i < text.length; i++) put(text.charCodeAt(i));
    return { bytes: out, lost: 0 };
  }
  const m = byteMap(enc), out = []; let lost = 0;
  for (const ch of text) {
    const c = m.has(ch) ? ch : RO_FIX[ch] && m.has(RO_FIX[ch]) ? RO_FIX[ch] : null;
    if (c !== null) out.push(m.get(c)); else { out.push(63); lost++; }
  }
  return { bytes: Uint8Array.from(out), lost };
}

// ---------- time ----------
const pad = (n, w = 2) => String(n).padStart(w, "0");
/** style: "srt" (00:00:01,500), "vtt" (00:00:01.500), "ass" (0:00:01.50). */
export function fmtTime(ms, style = "srt") {
  ms = Math.max(0, Math.round(ms));
  if (style === "ass") { ms = Math.round(ms / 10) * 10; const cs = (ms % 1000) / 10; ms = Math.floor(ms / 1000); return `${Math.floor(ms / 3600)}:${pad(Math.floor(ms / 60) % 60)}:${pad(ms % 60)}.${pad(cs)}`; }
  const f = ms % 1000, s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}${style === "vtt" ? "." : ","}${pad(f, 3)}`;
}
/** Flexible: "1:02:03,450", "02:03.4", "83.5", "1:23" -> ms (NaN when invalid). The fraction is a decimal fraction of a second. */
export function parseTime(s) {
  const m = /^\s*(?:(\d+):)?(?:(\d{1,2}):)?(\d+)(?:[.,](\d+))?\s*$/.exec(String(s));
  if (!m) return NaN;
  let a = m[1], b = m[2], c = m[3];
  // 1 group = seconds, 2 groups = mm:ss, 3 groups = hh:mm:ss
  let h = 0, mi = 0;
  if (a !== undefined && b !== undefined) { h = +a; mi = +b; } else if (a !== undefined) { mi = +a; }
  return Math.round(((h * 60 + mi) * 60 + +c) * 1000 + (m[4] ? parseFloat("0." + m[4]) * 1000 : 0));
}

// ---------- inline styling ----------
const bgr = (c) => { const m = /&?H?([0-9a-f]{6,8})&?/i.exec(c || ""); if (!m) return null; const h = m[1].slice(-6); return ("#" + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toLowerCase(); };
export const assColorToCss = bgr;
export const cssToAssColor = (hex, alpha = "00") => { const h = hex.replace("#", ""); return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };

/** Split internal text into styled runs: [{ t, i, b, u, s, c, nl }]. Also returns event-level overrides { an, pos }. */
export function segments(text) {
  const out = [], meta = {}; let st = { i: 0, b: 0, u: 0, s: 0, c: null, fs: null, fn: null, oc: null };
  const push = (t) => { if (t) out.push({ t, ...st }); };
  const re = /\{([^}]*)\}|\\N|\\n|\\h/g; let last = 0, m;
  while ((m = re.exec(text))) {
    push(text.slice(last, m.index)); last = re.lastIndex;
    if (m[0] === "\\N" || m[0] === "\\n") out.push({ nl: true, ...st });
    else if (m[0] === "\\h") push("\u00a0");
    else for (const tag of m[1].split("\\").slice(1)) {
      let k;
      if ((k = /^([ibus])(\d*)$/.exec(tag))) st = { ...st, [k[1]]: k[1] === "b" ? (k[2] === "" || +k[2] > 0 ? 1 : 0) : +(k[2] === "" ? 1 : k[2]) ? 1 : 0 };
      else if ((k = /^1?c(&H[0-9a-f]+&?)?$/i.exec(tag))) st = { ...st, c: k[1] ? bgr(k[1]) : null };
      else if ((k = /^3c(&H[0-9a-f]+&?)$/i.exec(tag))) st = { ...st, oc: bgr(k[1]) };
      else if ((k = /^fs(\d+(?:\.\d+)?)$/.exec(tag))) st = { ...st, fs: +k[1] };
      else if ((k = /^fn(.+)$/.exec(tag))) st = { ...st, fn: k[1] };
      else if ((k = /^an([1-9])$/.exec(tag))) meta.an = +k[1];
      else if ((k = /^pos\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(tag))) meta.pos = [+k[1], +k[2]];
      else if (tag === "r") st = { i: 0, b: 0, u: 0, s: 0, c: null, fs: null, fn: null, oc: null };
    }
  }
  push(text.slice(last));
  return { runs: out, meta };
}
/** The text a viewer reads: no tags, real line breaks. */
export const plainText = (text) => segments(text).runs.map((r) => (r.nl ? "\n" : r.t)).join("");
const KNOWN = /^(?:[ibus]\d*|1?c(?:&H[0-9a-f]+&?)?|r)$/i;

/** Internal -> SRT/VTT markup. Returns { text, lost } (lost = 1 when positioning/size/font tags had to be dropped). */
function toMarkup(text, vtt) {
  let lost = 0, s = "", open = { i: 0, b: 0, u: 0, s: 0, c: null };
  for (const blk of text.matchAll(/\{[^}]*\}/g)) if (blk[0].slice(1, -1).split("\\").slice(1).some((x) => x && !KNOWN.test(x))) { lost = 1; break; }
  const esc = (x) => (vtt ? x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : x);
  const close = (k) => (k === "c" ? "</font>" : `</${k}>`);
  const order = ["c", "s", "u", "b", "i"];
  const sync = (r) => {
    for (const k of order) { const want = k === "c" ? r.c : r[k]; if (open[k] && open[k] !== want) { s += close(k); open[k] = k === "c" ? null : 0; } }
    for (const k of [...order].reverse()) { const want = k === "c" ? r.c : r[k]; if (want && !open[k]) { if (k === "s" && vtt) continue; s += k === "c" ? `<font color="${want}">` : `<${k}>`; open[k] = want; } }
  };
  for (const r of segments(text).runs) { sync(r); s += r.nl ? "\n" : esc(r.t); }
  sync({ i: 0, b: 0, u: 0, s: 0, c: null });
  return { text: s, lost };
}
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&nbsp;": "\u00a0", "&quot;": '"', "&apos;": "'", "&lrm;": "", "&rlm;": "" };
/** SRT/VTT markup -> internal text. */
function fromMarkup(s) {
  s = s.replace(/\r\n?/g, "\n").replace(/<\/?(?:c|v|lang|ruby|rt)(?:[. ][^>]*)?>/gi, "").replace(/<\d{1,2}:\d{2}[:.]\d{2,3}(?:[.,]\d{3})?>/g, "");
  s = s.replace(/<(\/?)([ibus])>/gi, (_, c, k) => `{\\${k.toLowerCase()}${c ? 0 : 1}}`)
    .replace(/<font[^>]*color\s*=\s*["']?#?([0-9a-f]{6})["']?[^>]*>/gi, (_, h) => { const H = h.toUpperCase(); return `{\\c&H${H.slice(4, 6)}${H.slice(2, 4)}${H.slice(0, 2)}&}`; }).replace(/<\/font>/gi, "{\\c}").replace(/<font[^>]*>/gi, "")
    .replace(/\{\\an([1-9])\}/g, "{\\an$1}").replace(/<[^>]+>/g, "");
  s = s.replace(/&(?:amp|lt|gt|nbsp|quot|apos|lrm|rlm);/g, (e) => ENT[e]);
  return s.replace(/\n/g, "\\N").replace(/\{\\([ibus])([01])\}\{\\\1\2\}/g, "{\\$1$2}");
}

// ---------- document model ----------
export const defaultStyle = (name = "Default") => ({ name, font: "Arial", size: 64, primary: "&H00FFFFFF", secondary: "&H000000FF", outline: "&H00000000", back: "&H80000000", bold: 0, italic: 0, underline: 0, strike: 0, scaleX: 100, scaleY: 100, spacing: 0, angle: 0, borderStyle: 1, outlineW: 3, shadow: 1, alignment: 2, marginL: 30, marginR: 30, marginV: 40, encoding: 1 });
export function newDoc(format = "srt") { return { format, info: { PlayResX: "1920", PlayResY: "1080" }, styles: [defaultStyle()], events: [], extra: "", n: 1 }; }
const addEv = (doc, e) => { const ev = { id: doc.n++, start: 0, end: 2000, style: "Default", name: "", layer: 0, marginL: 0, marginR: 0, marginV: 0, effect: "", text: "", comment: false, vtt: "", ...e }; doc.events.push(ev); return ev; };

export function detectFormat(text) {
  const t = text.replace(/^\uFEFF/, "");
  if (/^WEBVTT/.test(t)) return "vtt";
  if (/^\s*\[(?:Script Info|V4\+? Styles)\]/im.test(t)) return "ass";
  return "srt";
}
export function parse(text, hint) {
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const f = hint || detectFormat(text);
  return f === "ass" ? parseASS(text) : parseCues(text, f);
}

function parseCues(text, format) {
  const doc = newDoc(format), TIME = /(\d+:)?\d{1,2}:\d{2}[.,]\d{1,3}/;
  const lines = text.split("\n"); let i = 0;
  if (format === "vtt") { while (i < lines.length && lines[i].trim() !== "") i++; }
  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i >= lines.length) break;
    const block = []; while (i < lines.length && lines[i].trim() !== "") block.push(lines[i++]);
    if (/^(NOTE|STYLE|REGION)\b/.test(block[0])) continue;
    const ti = block.findIndex((l) => l.includes("-->") && TIME.test(l)); if (ti < 0) continue;
    const m = /^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)\s*(.*)$/.exec(block[ti]); if (!m) continue;
    addEv(doc, { start: parseTime(m[1]), end: parseTime(m[2]), vtt: m[3].trim(), text: fromMarkup(block.slice(ti + 1).join("\n")) });
  }
  return doc;
}

const ASS_STYLE_KEYS = { name: "name", fontname: "font", fontsize: "size", primarycolour: "primary", secondarycolour: "secondary", tertiarycolour: "outline", outlinecolour: "outline", backcolour: "back", bold: "bold", italic: "italic", underline: "underline", strikeout: "strike", scalex: "scaleX", scaley: "scaleY", spacing: "spacing", angle: "angle", borderstyle: "borderStyle", outline: "outlineW", shadow: "shadow", alignment: "alignment", marginl: "marginL", marginr: "marginR", marginv: "marginV", encoding: "encoding" };
const SSA_ALIGN = { 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 };
const NUMERIC = new Set(["size", "bold", "italic", "underline", "strike", "scaleX", "scaleY", "spacing", "angle", "borderStyle", "outlineW", "shadow", "alignment", "marginL", "marginR", "marginV", "encoding"]);
function parseASS(text) {
  const doc = { format: "ass", info: {}, styles: [], events: [], extra: "", n: 1 };
  let sec = "", sf = null, ef = null, ssa = false, extra = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim(), sm = /^\[(.+)\]$/.exec(line);
    if (sm) { sec = sm[1].toLowerCase(); if (!["script info", "v4+ styles", "v4 styles", "events"].includes(sec)) extra.push(raw); if (sec === "v4 styles") ssa = true; continue; }
    if (!["script info", "v4+ styles", "v4 styles", "events"].includes(sec)) { if (sec) extra.push(raw); continue; }
    if (!line || line.startsWith(";") || line.startsWith("!:")) continue;
    const c = line.indexOf(":"); if (c < 0) continue;
    const key = line.slice(0, c).trim().toLowerCase(), val = line.slice(c + 1).trim();
    if (sec === "script info") { doc.info[line.slice(0, c).trim()] = val; continue; }
    if (key === "format") { const f = val.split(",").map((x) => x.trim().toLowerCase()); if (sec === "events") ef = f; else sf = f; continue; }
    if (sec.includes("styles") && key === "style" && sf) {
      const v = val.split(","), st = defaultStyle("");
      sf.forEach((k, idx) => { const f = ASS_STYLE_KEYS[k]; if (!f) return; const x = (v[idx] ?? "").trim(); st[f] = NUMERIC.has(f) ? (f === "bold" || f === "italic" || f === "underline" || f === "strike" ? (+x ? 1 : 0) : +x || 0) : x; });
      if (ssa) st.alignment = SSA_ALIGN[st.alignment] || 2;
      doc.styles.push(st);
    } else if (sec === "events" && (key === "dialogue" || key === "comment") && ef) {
      const n = ef.length, v = val.split(","), head = v.slice(0, n - 1), txt = v.slice(n - 1).join(",");
      const g = (k) => { const ix = ef.indexOf(k); return ix >= 0 && ix < n - 1 ? head[ix].trim() : ""; };
      addEv(doc, { layer: +(g("layer") || g("marked").replace(/\D/g, "")) || 0, start: parseTime(g("start")), end: parseTime(g("end")), style: g("style") || "Default", name: g("name"), marginL: +g("marginl") || 0, marginR: +g("marginr") || 0, marginV: +g("marginv") || 0, effect: g("effect"), text: txt, comment: key === "comment" });
    }
  }
  if (!doc.styles.length) doc.styles.push(defaultStyle());
  doc.extra = extra.join("\n").trim();
  for (const ev of doc.events) if (Number.isNaN(ev.start)) ev.start = 0, ev.end = Number.isNaN(ev.end) ? 0 : ev.end;
  return doc;
}

// ---------- writing ----------
/** @returns {{ text: string, lost: number }} lost = events that lost inline positioning/font tags in SRT/VTT */
export function serialize(doc, format = doc.format) {
  const evs = doc.events.filter((e) => !e.comment);
  if (format === "ass") {
    const info = { ...doc.info, ScriptType: "v4.00+" }; if (!info.PlayResX) info.PlayResX = "1920"; if (!info.PlayResY) info.PlayResY = "1080"; if (!("WrapStyle" in info)) info.WrapStyle = "0"; if (!("ScaledBorderAndShadow" in info)) info.ScaledBorderAndShadow = "yes";
    let s = "[Script Info]\n; Script generated by OmniView\n" + Object.entries(info).map(([k, v]) => `${k}: ${v}`).join("\n");
    s += "\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n";
    s += doc.styles.map((x) => `Style: ${[x.name, x.font, x.size, x.primary, x.secondary, x.outline, x.back, x.bold ? -1 : 0, x.italic ? -1 : 0, x.underline ? -1 : 0, x.strike ? -1 : 0, x.scaleX, x.scaleY, x.spacing, x.angle, x.borderStyle, x.outlineW, x.shadow, x.alignment, x.marginL, x.marginR, x.marginV, x.encoding].join(",")}`).join("\n");
    s += "\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n";
    s += doc.events.map((e) => `${e.comment ? "Comment" : "Dialogue"}: ${e.layer},${fmtTime(e.start, "ass")},${fmtTime(e.end, "ass")},${e.style},${e.name},${e.marginL},${e.marginR},${e.marginV},${e.effect},${e.text}`).join("\n");
    return { text: s + "\n" + (doc.extra ? "\n" + doc.extra + "\n" : ""), lost: 0 };
  }
  const vtt = format === "vtt"; let lost = 0, n = 0;
  const body = evs.map((e) => { const m = toMarkup(e.text, vtt); lost += m.lost; n++; return (vtt ? "" : n + "\n") + `${fmtTime(e.start, vtt ? "vtt" : "srt")} --> ${fmtTime(e.end, vtt ? "vtt" : "srt")}${vtt && e.vtt ? " " + e.vtt : ""}\n${m.text}`; }).join("\n\n");
  return { text: (vtt ? "WEBVTT\n\n" : "") + body + "\n", lost };
}

// ---------- editing operations (pure on a doc; the editor snapshots before calling them) ----------
const pick = (doc, ids) => (ids ? doc.events.filter((e) => ids.has(e.id)) : doc.events);
export const sortEvents = (doc) => { doc.events.sort((a, b) => a.start - b.start || a.id - b.id); };
export function shift(doc, ids, ms) { for (const e of pick(doc, ids)) { e.start = Math.max(0, e.start + ms); e.end = Math.max(e.start, e.end + ms); } }
/** Linear retiming from two reference points: a = { from, to }, b = { from, to } (ms). */
export function retimeLinear(doc, ids, a, b) {
  if (a.from === b.from) throw new Error("The two reference points must be at different times.");
  const k = (b.to - a.to) / (b.from - a.from), f = (t) => Math.max(0, Math.round(a.to + (t - a.from) * k));
  for (const e of pick(doc, ids)) { e.start = f(e.start); e.end = Math.max(e.start, f(e.end)); }
}
/** Same frames at a new rate: a subtitle made for 25 fps video shown on 23.976 fps video needs factor 25/23.976. */
export function scaleFps(doc, ids, fromFps, toFps) { retimeLinear(doc, ids, { from: 0, to: 0 }, { from: 1000, to: (1000 * fromFps) / toFps }); }
export function insertAfter(doc, id, at = {}) {
  const i = doc.events.findIndex((e) => e.id === id), ref = doc.events[i];
  const ev = { id: doc.n++, start: ref ? ref.end : 0, end: (ref ? ref.end : 0) + 2000, style: ref?.style || doc.styles[0]?.name || "Default", name: "", layer: ref?.layer || 0, marginL: 0, marginR: 0, marginV: 0, effect: "", text: "", comment: false, vtt: "", ...at };
  doc.events.splice(i + 1, 0, ev); return ev;
}
export function duplicate(doc, ids) { const made = []; for (const e of pick(doc, ids)) { const c = insertAfter(doc, e.id, { ...e, id: doc.n }); c.id = doc.n - 1; made.push(c); } return made; }
export const remove = (doc, ids) => { doc.events = doc.events.filter((e) => !ids.has(e.id)); };
/** Split at a time and (optionally) a character index of the raw text. */
export function split(doc, id, time, charIndex) {
  const e = doc.events.find((x) => x.id === id); if (!e || time <= e.start || time >= e.end) return null;
  const idx = charIndex == null ? Math.round((e.text.length * (time - e.start)) / (e.end - e.start)) : charIndex;
  const second = insertAfter(doc, id, { start: time, end: e.end, text: e.text.slice(idx).trim(), style: e.style, layer: e.layer });
  e.end = time; e.text = e.text.slice(0, idx).trim(); return second;
}
export function merge(doc, ids) {
  const list = doc.events.filter((e) => ids.has(e.id)); if (list.length < 2) return null;
  const first = list[0]; first.start = Math.min(...list.map((e) => e.start)); first.end = Math.max(...list.map((e) => e.end)); first.text = list.map((e) => e.text).join("\\N");
  doc.events = doc.events.filter((e) => e === first || !ids.has(e.id)); return first;
}
export function findReplace(doc, { find, replace = "", regex = false, matchCase = false, wholeWord = false }, ids) {
  if (!find) return 0;
  const src = regex ? find : find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), re = new RegExp(wholeWord ? `\\b(?:${src})\\b` : src, "g" + (matchCase ? "" : "i")); let n = 0;
  for (const e of pick(doc, ids)) { const next = e.text.replace(re, () => { n++; return replace; }); if (next !== e.text) e.text = regex ? e.text.replace(re, replace) : next; }
  return n;
}
/** Romanian files often use cedilla letters (ş ţ); the correct letters have a comma below (ș ț). */
export function normalizeRomanian(doc) { let n = 0; for (const e of doc.events) { const t = e.text.replace(/[şţŞŢ]/g, (c) => { n++; return { "ş": "ș", "ţ": "ț", "Ş": "Ș", "Ţ": "Ț" }[c]; }); e.text = t; } return n; }
export function fixOverlaps(doc) { sortEvents(doc); let n = 0; const ev = doc.events.filter((e) => !e.comment); for (let i = 0; i < ev.length - 1; i++) if (ev[i].end > ev[i + 1].start) { ev[i].end = Math.max(ev[i].start, ev[i + 1].start); n++; } return n; }

/** Quality checks in the spirit of Aegisub's timing tools. */
export function qc(doc, { maxCps = 21, minDur = 700, maxDur = 7000, maxLine = 42 } = {}) {
  const out = [], ev = doc.events.filter((e) => !e.comment).sort((a, b) => a.start - b.start || a.id - b.id);
  ev.forEach((e, i) => {
    const text = plainText(e.text), dur = e.end - e.start, add = (kind, msg, detail = "") => out.push({ id: e.id, kind, msg, detail });
    if (!text.trim()) add("empty", "Empty text");
    if (dur <= 0) add("duration", "Zero or negative duration"); else {
      if (dur < minDur) add("short", "Very short line");
      if (dur > maxDur) add("long", "Very long line");
      const cps = text.replace(/\n/g, "").length / (dur / 1000); if (cps > maxCps) add("cps", "Reading speed is too high", cps.toFixed(1) + "/s");
    }
    if (text.split("\n").some((l) => l.length > maxLine)) add("width", "A line is too long", ">" + maxLine);
    if (ev[i + 1] && e.end > ev[i + 1].start) add("overlap", "Overlaps the next line");
  });
  return out;
}
export const cps = (e) => { const d = e.end - e.start; return d > 0 ? plainText(e.text).replace(/\n/g, "").length / (d / 1000) : 0; };
