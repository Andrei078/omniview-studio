import { describe, expect, it } from "vitest";
import { scanKeys, placeholders } from "../scripts/i18n-scan.mjs";
import { RO } from "../js/lang/ro.js";
import { resolveLang, translate, LANGS } from "../js/i18n.js";

const keys = scanKeys(".");
describe("translations are complete (scanned from the real source and index.html)", () => {
  it("finds the UI strings", () => { expect(keys.length).toBeGreaterThan(200); });
  it("Romanian has every string", () => { expect(keys.filter((k) => !RO[k])).toEqual([]); });
  it("Romanian has no stale entries", () => { expect(Object.keys(RO).filter((k) => !keys.includes(k))).toEqual([]); });
  it("placeholders match the English text", () => { expect(keys.filter((k) => RO[k] && placeholders(k) !== placeholders(RO[k]))).toEqual([]); });
  it("every shipped language except English has a table", () => { expect(LANGS.map((l) => l.code)).toEqual(["en", "ro"]); });
});
describe("runtime", () => {
  it("falls back to English and interpolates", () => {
    expect(translate("ro", "Unknown text")).toBe("Unknown text");
    expect(translate("ro", "Import files")).toBe("Importă fișiere");
    expect(translate("ro", "Page {n}", { n: 4 })).toBe("Pagina 4");
    expect(translate("en", "Page {n}", { n: 4 })).toBe("Page 4");
    expect(translate("en", "Hi {x}", { y: 1 })).toBe("Hi {x}");
  });
  it("resolves system language", () => {
    expect(resolveLang("system", "ro-RO")).toBe("ro"); expect(resolveLang("system", "ja")).toBe("en"); expect(resolveLang("ro", "en-US")).toBe("ro"); expect(resolveLang("xx", "ro")).toBe("ro");
  });
});
