import { describe, expect, it } from "vitest";
import * as S from "../js/subs.js";

const SRT = "\uFEFF1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>world</i>\r\nsecond line\r\n\r\n2\r\n00:00:04.000 --> 00:00:06,000\r\n<font color=\"#ff0000\">Red</font> &amp; <b>bold</b>\r\n\r\n00:00:07,000 --> 00:00:08,000\r\nNo index {\\an8}top\r\n";
const VTT = "WEBVTT - title\n\nNOTE a comment\n\nSTYLE\n::cue { color: red }\n\nintro\n00:01.000 --> 00:03.000 align:start position:10%\nFirst <v Bob>cue</v>\n\n01:00:00.500 --> 01:00:02.000\nSecond <c.yellow>cue</c>\n";
const ASS = `[Script Info]
Title: Demo
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 720

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,20,1
Style: Top,Georgia,40,&H0000FFFF,&H000000FF,&H00112233,&H80000000,-1,-1,0,0,100,100,0,0,1,2,1,8,10,10,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello, {\\i1}world{\\i0}\\Nsecond
Comment: 0,0:00:04.00,0:00:05.00,Default,,0,0,0,,hidden note
Dialogue: 1,0:00:06.25,0:00:08.00,Top,Bob,0,0,0,,{\\an8\\c&H0000FF&}Red top

[Fonts]
fontname: x.ttf
`;

describe("time", () => {
  it("formats in all three styles", () => {
    expect(S.fmtTime(3723456, "srt")).toBe("01:02:03,456"); expect(S.fmtTime(3723456, "vtt")).toBe("01:02:03.456"); expect(S.fmtTime(3723456, "ass")).toBe("1:02:03.46"); expect(S.fmtTime(-5)).toBe("00:00:00,000");
  });
  it("parses flexible input", () => {
    expect(S.parseTime("1:02:03,450")).toBe(3723450); expect(S.parseTime("02:03.4")).toBe(123400); expect(S.parseTime("83.5")).toBe(83500); expect(S.parseTime("0:00:01.50")).toBe(1500); expect(S.parseTime("1:23")).toBe(83000);
    expect(S.parseTime("abc")).toBeNaN(); expect(S.parseTime("")).toBeNaN();
  });
});

describe("SRT", () => {
  const d = S.parse(SRT);
  it("parses BOM, CRLF, dot decimals, missing index, entities and tags", () => {
    expect(d.format).toBe("srt"); expect(d.events).toHaveLength(3);
    expect(d.events[0]).toMatchObject({ start: 1000, end: 3500, text: "Hello {\\i1}world{\\i0}\\Nsecond line" });
    expect(d.events[1].start).toBe(4000); expect(d.events[1].text).toBe("{\\c&H0000FF&}Red{\\c} & {\\b1}bold{\\b0}");
    expect(d.events[2].text).toBe("No index {\\an8}top");
  });
  it("round-trips through SRT, keeping times and plain text", () => {
    const again = S.parse(S.serialize(d, "srt").text);
    expect(again.events.map((e) => [e.start, e.end, S.plainText(e.text)])).toEqual(d.events.map((e) => [e.start, e.end, S.plainText(e.text)]));
  });
  it("writes valid SRT", () => {
    const out = S.serialize(d, "srt"); expect(out.text.startsWith("1\n00:00:01,000 --> 00:00:03,500\nHello <i>world</i>\nsecond line")).toBe(true); expect(out.text).toContain('<font color="#ff0000">Red</font>');
    expect(out.lost).toBe(1); // {\an8} cannot be expressed in SRT
  });
});

describe("WebVTT", () => {
  const d = S.parse(VTT);
  it("skips NOTE/STYLE blocks, accepts ids and short timestamps, keeps cue settings", () => {
    expect(d.format).toBe("vtt"); expect(d.events).toHaveLength(2);
    expect(d.events[0]).toMatchObject({ start: 1000, end: 3000, vtt: "align:start position:10%", text: "First cue" });
    expect(d.events[1]).toMatchObject({ start: 3600500, text: "Second cue" });
  });
  it("writes WEBVTT with dot decimals, escaping markup characters", () => {
    d.events[0].text = "a < b & {\\i1}c{\\i0}";
    const out = S.serialize(d, "vtt").text; expect(out.startsWith("WEBVTT\n\n00:00:01.000 --> 00:00:03.000 align:start position:10%\na &lt; b &amp; <i>c</i>")).toBe(true);
  });
});

describe("ASS / SSA", () => {
  const d = S.parse(ASS);
  it("parses info, styles, events (commas inside text, comments, layers, actor)", () => {
    expect(d.format).toBe("ass"); expect(d.info).toMatchObject({ Title: "Demo", PlayResX: "1280", PlayResY: "720" });
    expect(d.styles.map((s) => s.name)).toEqual(["Default", "Top"]);
    expect(d.styles[1]).toMatchObject({ font: "Georgia", size: 40, bold: 1, italic: 1, alignment: 8, primary: "&H0000FFFF" });
    expect(d.events).toHaveLength(3); expect(d.events[0]).toMatchObject({ start: 1000, end: 3500, text: "Hello, {\\i1}world{\\i0}\\Nsecond", style: "Default" });
    expect(d.events[1].comment).toBe(true); expect(d.events[2]).toMatchObject({ layer: 1, name: "Bob", start: 6250, style: "Top" });
    expect(d.extra).toContain("[Fonts]");
  });
  it("round-trips ASS without losing anything", () => {
    const again = S.parse(S.serialize(d, "ass").text);
    expect(again.styles).toEqual(d.styles); expect(again.events.map(({ id, ...e }) => e)).toEqual(d.events.map(({ id, ...e }) => e)); expect(again.info.PlayResX).toBe("1280"); expect(again.extra).toContain("[Fonts]");
  });
  it("ASS -> SRT drops comments and reports lost positioning", () => {
    const out = S.serialize(d, "srt"); expect(out.text).not.toContain("hidden note"); expect(out.lost).toBe(1);
    expect(out.text).toContain("<font color=\"#ff0000\">Red top</font>");
  });
  it("SRT -> ASS creates a Default style and escapes line breaks", () => {
    const text = S.serialize(S.parse(SRT), "ass").text; expect(text).toContain("[V4+ Styles]"); expect(text).toContain("Style: Default,Arial,64"); expect(text).toContain("Dialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,Hello {\\i1}world{\\i0}\\Nsecond line");
  });
  it("reads old SSA (V4) styles and converts alignment", () => {
    const ssa = "[Script Info]\nScriptType: v4.00\n\n[V4 Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding\nStyle: Default,Arial,20,16777215,255,0,0,0,0,1,2,1,6,10,10,10,0,0\n\n[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: Marked=0,0:00:01.00,0:00:02.00,Default,,0,0,0,,old\n";
    const x = S.parse(ssa); expect(x.styles[0].alignment).toBe(8); expect(x.events[0]).toMatchObject({ start: 1000, text: "old" });
  });
});

describe("inline styling", () => {
  it("splits text into styled runs with overrides", () => {
    const { runs, meta } = S.segments("{\\an8\\pos(100,50)}A {\\i1\\b1\\c&H0000FF&}B{\\r}\\NC");
    expect(meta).toEqual({ an: 8, pos: [100, 50] }); expect(runs.map((r) => r.nl ? "NL" : r.t)).toEqual(["A ", "B", "NL", "C"]);
    expect(runs[1]).toMatchObject({ i: 1, b: 1, c: "#ff0000" }); expect(runs[3]).toMatchObject({ i: 0, b: 0, c: null });
    expect(S.plainText("x\\Ny {\\i1}z")).toBe("x\ny z");
  });
});

describe("encodings", () => {
  it("auto-detects UTF-8, BOM-less legacy Romanian and UTF-16", () => {
    expect(S.decodeBytes(new TextEncoder().encode("ăâîșț")).encoding).toBe("utf-8");
    const win = Uint8Array.from([0x63, 0x75, 0xe3, 0x20, 0xba, 0x69, 0x20, 0xfe]); // "cuă şi ţ" in windows-1250
    const r = S.decodeBytes(win); expect(r.encoding).toBe("windows-1250"); expect(r.text).toBe("cuă şi ţ");
    const u16 = S.encodeText("Salut ș", "utf-16le").bytes; expect(S.decodeBytes(u16)).toEqual({ text: "Salut ș", encoding: "utf-16le" });
  });
  it("encodes Romanian to Windows-1250, mapping comma-below letters and counting what cannot be stored", () => {
    const e = S.encodeText("ăâîșțĂÂÎȘȚ", "windows-1250"); expect(e.lost).toBe(0); expect(S.decodeBytes(e.bytes, "windows-1250").text).toBe("ăâîşţĂÂÎŞŢ");
    const w = S.encodeText("日本", "windows-1250"); expect(w.lost).toBe(2); expect(Array.from(w.bytes)).toEqual([63, 63]);
    const b = S.encodeText("é", "utf-8", { bom: true }).bytes; expect(Array.from(b.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
  });
});

describe("timing operations", () => {
  const make = () => S.parse("1\n00:00:10,000 --> 00:00:12,000\nA\n\n2\n00:00:20,000 --> 00:00:22,000\nB\n\n3\n00:00:30,000 --> 00:00:32,000\nC\n");
  it("shifts all or selected lines and never goes below zero", () => {
    const d = make(); S.shift(d, null, 1500); expect(d.events.map((e) => e.start)).toEqual([11500, 21500, 31500]);
    S.shift(d, new Set([d.events[0].id]), -20000); expect(d.events[0]).toMatchObject({ start: 0, end: 0 });
  });
  it("retimes linearly from two reference points", () => {
    const d = make(); S.retimeLinear(d, null, { from: 10000, to: 11000 }, { from: 30000, to: 33000 });
    expect(d.events.map((e) => e.start)).toEqual([11000, 22000, 33000]); expect(d.events[0].end).toBe(13200);
    expect(() => S.retimeLinear(d, null, { from: 1, to: 1 }, { from: 1, to: 5 })).toThrow();
  });
  it("converts frame rates (25 -> 23.976 stretches time)", () => {
    const d = make(); S.scaleFps(d, null, 25, 23.976); expect(d.events[0].start).toBe(Math.round(10000 * 25 / 23.976));
  });
});

describe("editing operations", () => {
  const make = () => S.parse("1\n00:00:10,000 --> 00:00:14,000\nHello world\n\n2\n00:00:20,000 --> 00:00:22,000\nSecond\n");
  it("inserts, duplicates, deletes", () => {
    const d = make(); const n = S.insertAfter(d, d.events[0].id); expect(d.events[1]).toBe(n); expect(n.start).toBe(14000);
    const [c] = S.duplicate(d, new Set([d.events[0].id])); expect(c.text).toBe("Hello world"); expect(new Set(d.events.map((e) => e.id)).size).toBe(d.events.length);
    S.remove(d, new Set([c.id, n.id])); expect(d.events).toHaveLength(2);
  });
  it("splits at a time and merges lines back", () => {
    const d = make(); const a = d.events[0], second = S.split(d, a.id, 12000, 5);
    expect(a).toMatchObject({ end: 12000, text: "Hello" }); expect(second).toMatchObject({ start: 12000, end: 14000, text: "world" });
    expect(S.split(d, a.id, 99999)).toBeNull();
    const m = S.merge(d, new Set([a.id, second.id])); expect(m).toMatchObject({ start: 10000, end: 14000, text: "Hello\\Nworld" }); expect(d.events).toHaveLength(2);
  });
  it("finds and replaces (plain, case, whole word, regex)", () => {
    const d = make(); expect(S.findReplace(d, { find: "HELLO", replace: "Hi" })).toBe(1); expect(d.events[0].text).toBe("Hi world");
    expect(S.findReplace(d, { find: "HELLO", replace: "x", matchCase: true })).toBe(0); expect(S.findReplace(d, { find: "wor", replace: "x", wholeWord: true })).toBe(0);
    expect(S.findReplace(d, { find: "(\\w+) world", replace: "$1!", regex: true })).toBe(1); expect(d.events[0].text).toBe("Hi!");
  });
  it("normalizes Romanian cedilla letters", () => { const d = make(); d.events[0].text = "şi ţară Şi Ţ"; expect(S.normalizeRomanian(d)).toBe(4); expect(d.events[0].text).toBe("și țară Și Ț"); });
});

describe("quality checks", () => {
  it("flags overlap, short, long, fast reading, wide lines, empty and zero duration", () => {
    const d = S.newDoc("srt"); const add = (start, end, text) => S.insertAfter(d, d.events.at(-1)?.id, { start, end, text });
    add(0, 3000, "ok"); add(2500, 2700, "x"); add(9000, 20000, "long"); add(21000, 21500, "A very very long sentence here"); add(30000, 32000, "x".repeat(50)); add(40000, 41000, ""); add(50000, 50000, "zero");
    const kinds = new Set(S.qc(d).map((i) => i.kind)); for (const k of ["overlap", "short", "long", "cps", "width", "empty", "duration"]) expect(kinds.has(k), k).toBe(true);
    expect(S.qc(S.parse("1\n00:00:01,000 --> 00:00:04,000\nFine line\n"))).toEqual([]);
  });
  it("fixes overlaps and reports cps", () => {
    const d = S.parse("1\n00:00:01,000 --> 00:00:05,000\nA\n\n2\n00:00:03,000 --> 00:00:06,000\nB\n"); expect(S.fixOverlaps(d)).toBe(1); expect(d.events[0].end).toBe(3000);
    expect(S.cps({ start: 0, end: 2000, text: "abcd\\Nefgh" })).toBe(4);
  });
});
