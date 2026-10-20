import { describe, expect, it } from "vitest";
import { detect, CAT, VIEWABLE } from "../js/detect.js";

const b = (...x) => new Uint8Array(Buffer.concat(x.map((v) => (typeof v === "string" ? Buffer.from(v, "latin1") : Buffer.from(v)))));
const png = () => b([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], new Array(20).fill(0));

describe("format detection from real bytes", () => {
  it("recognizes common images", () => {
    expect(detect(png(), "a.png").f).toBe("png");
    expect(detect(b([0xff, 0xd8, 0xff, 0xe0]), "a.jpg").f).toBe("jpeg");
    expect(detect(b("GIF89a"), "a.gif").f).toBe("gif");
    expect(detect(b("RIFF\0\0\0\0WEBPVP8 "), "a.webp").f).toBe("webp");
    expect(detect(b("II*\0"), "a.tif").f).toBe("tiff");
    expect(detect(b("\0\0\0\x18ftypavif"), "a.avif").f).toBe("avif");
    expect(detect(b("\0\0\0\x18ftypheic"), "a.heic").f).toBe("heic");
  });
  it("recognizes video and audio containers", () => {
    expect(detect(b("\0\0\0\x18ftypisom\0\0\0\0"), "v.mp4").f).toBe("mp4");
    expect(detect(b("\0\0\0\x14ftypqt  "), "v.mov").f).toBe("mov");
    expect(detect(b("\0\0\0\x18ftypM4A "), "s.m4a").f).toBe("m4a");
    expect(detect(b([0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0, 0x42, 0x82, 0x84], "webm"), "v.webm").f).toBe("webm");
    expect(detect(b([0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0, 0x42, 0x82, 0x88], "matroska"), "v.mkv").f).toBe("mkv");
    expect(detect(b("RIFF\0\0\0\0WAVEfmt "), "s.wav").f).toBe("wav");
    expect(detect(b("ID3\x04\0\0"), "s.mp3").f).toBe("mp3");
    expect(detect(b([0xff, 0xfb, 0x90, 0]), "s.mp3").f).toBe("mp3");
    expect(detect(b([0xff, 0xf1, 0x50, 0]), "s.aac").f).toBe("aac");
    expect(detect(b("fLaC\0\0"), "s.flac").f).toBe("flac");
    expect(detect(b("OggS\0\x02"), "s.ogg").f).toBe("ogg");
  });
  it("recognizes documents and uses the extension only to split ZIP-based formats", () => {
    expect(detect(b("%PDF-1.7\n"), "d.pdf").f).toBe("pdf");
    expect(detect(b("PK\x03\x04"), "r.docx").f).toBe("docx");
    expect(detect(b("PK\x03\x04"), "r.xlsx").f).toBe("xlsx");
    expect(detect(b("PK\x03\x04"), "r.pptx").f).toBe("pptx");
    expect(detect(b("PK\x03\x04"), "r.zip").f).toBe("zip");
    expect(detect(b([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), "old.doc").f).toBe("doc");
  });
  it("recognizes text-like formats", () => {
    expect(detect(b("hello"), "n.txt").f).toBe("txt");
    expect(detect(b("# Title"), "n.md").f).toBe("md");
    expect(detect(b("a,b\n1,2"), "t.csv").f).toBe("csv");
    expect(detect(b('{"a":1}'), "d.json").f).toBe("json");
    expect(detect(b("<!DOCTYPE html><html>"), "p.html").f).toBe("html");
    expect(detect(b('<?xml version="1.0"?><svg xmlns="x"/>'), "i.svg").f).toBe("svg");
  });
  it("the extension is only a hint: mismatches are flagged, garbage is rejected", () => {
    const r = detect(png(), "photo.jpg");
    expect(r.f).toBe("png"); expect(r.warn).toContain("png");
    expect(detect(png(), "a.png").warn).toBe("");
    expect(detect(b("PK\x03\x04"), "report.pdf").f).toBe("zip");
    expect(detect(b([0, 1, 2, 0, 3]), "x.png").f).toBe("bin");
  });
  it("every category entry is consistent", () => {
    for (const f of VIEWABLE) expect(CAT[f], f).toBeTruthy();
  });
  it("recognizes subtitle files by content, in UTF-8, UTF-16 and legacy code pages", () => {
    expect(detect(b("1\r\n00:00:01,000 --> 00:00:02,000\r\nHi"), "a.srt").f).toBe("srt");
    expect(detect(b("00:00:01.000 --> 00:00:02.000\nno index"), "a.srt").f).toBe("srt");
    expect(detect(b("WEBVTT\n\n00:01.000 --> 00:02.000\nHi"), "a.vtt").f).toBe("vtt");
    expect(detect(b("[Script Info]\nTitle: x\n"), "a.ass").f).toBe("ass");
    expect(detect(b("[Script Info]\nTitle: x\n"), "a.ssa").warn).toBe("");
    const win = new Uint8Array([...Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nsta"), 0xe3, 0x20, 0xba, 0x69]); // legacy Windows-1250 bytes, not valid UTF-8
    expect(detect(win, "ro.srt").f).toBe("srt");
    const u16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("1\n00:00:01,000 --> 00:00:02,000\nHi", "utf16le")]);
    expect(detect(new Uint8Array(u16), "u.srt").f).toBe("srt");
    expect(detect(b("plain notes, nothing timed here"), "n.srt").f).toBe("txt");
    expect(detect(b("1\n00:00:01,000 --> 00:00:02,000\nHi"), "wrong.txt").warn).toContain("srt");
    expect(detect(new Uint8Array([0x80, 0x81, 0x82, 0xe3, 0xe4]), "x.srt").f).toBe("bin");
  });
});
