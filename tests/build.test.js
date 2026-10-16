import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { buildSW } from "../scripts/build-sw.mjs";

const html = readFileSync("index.html", "utf8"), css = readFileSync("css/style.css", "utf8"), sw = readFileSync("sw.js", "utf8");
const precached = JSON.parse(/const FILES = (\[[\s\S]*?\]);/.exec(sw)[1]);

describe("modules", () => {
  it("every JavaScript module can be imported (no syntax or reference errors at load time)", async () => {
    for (const f of precached.filter((x) => x.startsWith("js/") && x.endsWith(".js"))) await import("../" + f);
  });
});

describe("site assets", () => {
  it("every file referenced by index.html exists and is precached for offline use", () => {
    const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((m) => m[1]).filter((r) => !r.startsWith("http"));
    expect(refs.length).toBeGreaterThan(5);
    for (const r of refs) { expect(existsSync(r), r).toBe(true); if (r !== "./") expect(precached, r).toContain(r); }
  });
  it("every url() in the stylesheet exists", () => {
    for (const m of css.matchAll(/url\(([^)]+)\)/g)) { const p = normalize(join("css", m[1].replace(/["']/g, ""))); expect(existsSync(p), p).toBe(true); }
  });
  it("the manifest icons exist and are precached", () => {
    const m = JSON.parse(readFileSync("manifest.webmanifest", "utf8"));
    for (const i of m.icons) { expect(existsSync(i.src), i.src).toBe(true); expect(precached).toContain(i.src); }
  });
  it("vendored libraries and ES modules are precached", () => {
    for (const f of ["vendor/pdf.min.js", "vendor/pdf.worker.min.js", "vendor/mammoth.browser.min.js", "vendor/purify.min.js", "vendor/xlsx.full.min.js", "vendor/fflate.min.js", "js/main.js", "js/viewers/pdf.js", "js/lang/ro.js"]) expect(precached, f).toContain(f);
  });
  it("sw.js is up to date (run `npm run build:sw` after changing any file)", () => { expect(buildSW(".").sw).toBe(sw); });
  it("the page loads nothing from the network except its own files", () => {
    for (const f of ["index.html", "css/style.css", ...precached.filter((x) => x.startsWith("js/"))]) expect(readFileSync(f, "utf8"), f).not.toMatch(/https?:\/\/(?!www\.w3\.org|github\.com|schemas)[a-z0-9.-]+\.(com|net|org|io)\/[^"'\s)]*\.(js|css|woff2?)/i);
  });
});
