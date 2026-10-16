import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS, loadSettings, sanitize, settings, update } from "../js/settings.js";

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); document.documentElement.style.cssText = ""; loadSettings(); });
describe("settings", () => {
  it("rejects invalid values and keeps defaults", () => {
    expect(sanitize({ theme: "neon", accent: "red", scale: 500, waveMb: 7, view: "wall", autoNext: "yes" })).toEqual(DEFAULTS);
    expect(sanitize(null)).toEqual(DEFAULTS); expect(sanitize({ theme: "dark" }).theme).toBe("dark");
  });
  it("persists and applies theme, density, size and accent", () => {
    update({ theme: "dark", density: "compact", scale: 120, accent: "#ff0066" });
    expect(JSON.parse(localStorage.getItem("ov-settings")).theme).toBe("dark");
    const r = document.documentElement;
    expect(r.dataset.theme).toBe("dark"); expect(r.dataset.density).toBe("compact"); expect(r.style.getPropertyValue("--fs")).toBe("18px"); expect(r.style.getPropertyValue("--br")).toBe("#ff0066");
    update({ theme: "system", accent: DEFAULTS.accent });
    expect(r.dataset.theme).toBeUndefined(); expect(r.style.getPropertyValue("--br")).toBe("");
  });
  it("survives corrupt stored JSON and invalid updates", () => {
    localStorage.setItem("ov-settings", "{broken"); loadSettings(); expect(settings).toEqual(DEFAULTS);
    update({ theme: "light" }); update({ theme: "bogus" }); expect(settings.theme).toBe("light");
  });
  it("switches the UI language", () => { update({ lang: "ro" }); expect(document.documentElement.lang).toBe("ro"); update({ lang: "en" }); expect(document.documentElement.lang).toBe("en"); });
});
