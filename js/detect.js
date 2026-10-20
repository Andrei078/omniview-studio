// Real-format detection from file bytes. The extension is only a hint.
import { t } from "./i18n.js";

export const CAT = { png: "img", jpeg: "img", gif: "img", webp: "img", bmp: "img", avif: "img", heic: "img", tiff: "img", svg: "img", mp4: "vid", mov: "vid", webm: "vid", mkv: "vid", avi: "vid", mp3: "aud", wav: "aud", flac: "aud", ogg: "aud", m4a: "aud", aac: "aud", pdf: "doc", docx: "doc", xlsx: "doc", pptx: "doc", odt: "doc", doc: "doc", xls: "doc", ppt: "doc", csv: "doc", txt: "txt", md: "txt", json: "txt", html: "txt", zip: "txt", srt: "sub", vtt: "sub", ass: "sub" };
export const MIME = { png: "image/png", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", avif: "image/avif", svg: "image/svg+xml", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", pdf: "application/pdf", srt: "application/x-subrip", vtt: "text/vtt", ass: "text/x-ssa", txt: "text/plain", md: "text/markdown", json: "application/json", csv: "text/csv", html: "text/html" };
/** Formats the site can actually open (others are recognized, listed and downloadable). */
export const VIEWABLE = new Set(["png", "jpeg", "gif", "webp", "bmp", "avif", "svg", "mp4", "mov", "webm", "mkv", "mp3", "wav", "flac", "ogg", "m4a", "aac", "pdf", "docx", "xlsx", "csv", "txt", "md", "json", "html", "srt", "vtt", "ass"]);
const EXT = { ass: ["ass", "ssa"], jpeg: ["jpg", "jpeg", "jpe"], mp4: ["mp4", "m4v"], tiff: ["tif", "tiff"], heic: ["heic", "heif"], ogg: ["ogg", "oga", "opus"], mkv: ["mkv", "mka"], mov: ["mov", "qt"], txt: ["txt", "log", "text"], md: ["md", "markdown"], html: ["html", "htm"] };
/** Subtitle signature inside decoded text (lower-cased). */
const subKind = (x) => (/^webvtt/.test(x) ? "vtt" : /^\s*\[(script info|v4\+? styles)\]/m.test(x) ? "ass" : /(^|\n)\s*(\d+\s*\n)?\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/.test(x) ? "srt" : null);
const TEXTLIKE = new Set(["txt", "md", "html", "json", "csv", "svg"]);

/** @param {Uint8Array} b first bytes (4 KB is plenty)  @param {string} name */
export function detect(b, name) {
  const e = (name.split(".").pop() || "").toLowerCase();
  const s = (i, n) => String.fromCharCode(...b.slice(i, i + n)), is = (...a) => a.every((v, i) => b[i] === v);
  let f = "bin";
  if (is(0x89, 0x50, 0x4e, 0x47)) f = "png";
  else if (is(0xff, 0xd8, 0xff)) f = "jpeg";
  else if (s(0, 3) === "GIF") f = "gif";
  else if (is(0x49, 0x49, 0x2a, 0) || is(0x4d, 0x4d, 0, 0x2a)) f = "tiff";
  else if (s(0, 4) === "RIFF") { const k = s(8, 4); f = k === "WEBP" ? "webp" : k === "WAVE" ? "wav" : k === "AVI " ? "avi" : "bin"; }
  else if (s(0, 2) === "BM" && e === "bmp") f = "bmp";
  else if (s(4, 4) === "ftyp") { const k = s(8, 4); f = /^avi[fs]/.test(k) ? "avif" : /^(hei|mif1|msf1)/.test(k) ? "heic" : k === "qt  " ? "mov" : /^M4[AB]/.test(k) ? "m4a" : "mp4"; }
  else if (is(0x1a, 0x45, 0xdf, 0xa3)) f = s(0, 64).includes("webm") ? "webm" : "mkv";
  else if (s(0, 4) === "OggS") f = "ogg";
  else if (s(0, 4) === "fLaC") f = "flac";
  else if ((b[0] === 0xff && b[1] === 0xfe && b[3] === 0 && b[2] >= 0x20) || (b[0] === 0xfe && b[1] === 0xff && b[2] === 0 && b[3] >= 0x20)) {
    f = subKind(new TextDecoder(b[0] === 0xff ? "utf-16le" : "utf-16be").decode(b).trimStart().toLowerCase()) || "bin"; // UTF-16 text (BOM + ASCII first character)
  }
  else if (s(0, 3) === "ID3" || (b[0] === 255 && (b[1] & 224) === 224)) f = b[0] === 255 && (b[1] & 6) === 0 ? "aac" : "mp3";
  else if (s(0, 1024).includes("%PDF-")) f = "pdf";
  else if (is(0x50, 0x4b, 3, 4)) f = ["docx", "xlsx", "pptx", "odt"].includes(e) ? e : "zip";
  else if (is(0xd0, 0xcf, 0x11, 0xe0)) f = ["doc", "xls", "ppt"].includes(e) ? e : "bin";
  else if (!b.includes(0)) {
    let x = null;
    try { x = new TextDecoder("utf-8", { fatal: true }).decode(b, { stream: true }).trimStart().toLowerCase(); } catch { /* not UTF-8 text */ }
    if (x === null) f = subKind(new TextDecoder("windows-1252").decode(b).trimStart().toLowerCase()) || "bin"; // legacy code pages: only accepted when it clearly is a subtitle
    else if (subKind(x)) f = subKind(x);
    else if (x !== null) f = x.includes("<svg") && /^(<\?xml|<svg|<!--)/.test(x) ? "svg" : /^(<!doctype html|<html)/.test(x) ? "html" : e === "md" || e === "markdown" ? "md" : e === "csv" || e === "tsv" ? "csv" : e === "json" ? "json" : "txt";
  }
  const ok = TEXTLIKE.has(f) || (EXT[f] || [f]).includes(e);
  return { f, warn: f !== "bin" && !ok ? t("The extension does not match the real format ({f})", { f }) : "" };
}
