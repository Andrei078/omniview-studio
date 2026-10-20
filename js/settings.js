// Persistent, validated user settings (localStorage) and their effect on the page.
import { setLang } from "./i18n.js";
import { onColor } from "./util.js";

export const DEFAULTS = { lang: "system", theme: "system", accent: "#4b3df0", density: "comfortable", scale: 100, view: "grid", autoNext: true, waveMb: 16, onboarded: false };
const RULES = {
  lang: (v) => typeof v === "string", theme: (v) => ["system", "light", "dark", "halloween"].includes(v), accent: (v) => /^#[0-9a-f]{6}$/i.test(v), density: (v) => ["comfortable", "compact"].includes(v),
  scale: (v) => Number.isFinite(v) && v >= 85 && v <= 130, view: (v) => ["grid", "list"].includes(v), autoNext: (v) => typeof v === "boolean", waveMb: (v) => [8, 16, 32, 64].includes(v), onboarded: (v) => typeof v === "boolean",
};
export const settings = { ...DEFAULTS };
const KEY = "ov-settings";

/** Keep only valid values; anything else falls back to the default. */
export function sanitize(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === "object") for (const k in DEFAULTS) if (k in raw && RULES[k](raw[k])) out[k] = raw[k];
  return out;
}
export function loadSettings() {
  try { Object.assign(settings, sanitize(JSON.parse(localStorage.getItem(KEY) || "{}"))); } catch { Object.assign(settings, DEFAULTS); }
  apply();
}
export function update(patch) {
  for (const k in patch) if (k in RULES && RULES[k](patch[k])) settings[k] = patch[k]; // invalid values are ignored, not reset
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* storage may be blocked */ }
  apply();
}
const THEME_COLORS = { light: "#f4f6fb", dark: "#0c1022", halloween: "#150b22" };
/** Mid-October to early November: time to offer the Halloween theme. */
export const inHalloweenSeason = (d = new Date()) => (d.getMonth() === 9 && d.getDate() >= 15) || (d.getMonth() === 10 && d.getDate() <= 2);
export function apply() {
  const r = document.documentElement;
  if (settings.theme === "system") delete r.dataset.theme; else r.dataset.theme = settings.theme;
  r.dataset.density = settings.density;
  r.style.setProperty("--fs", (15 * settings.scale) / 100 + "px");
  if (settings.accent.toLowerCase() !== DEFAULTS.accent) { r.style.setProperty("--br", settings.accent); r.style.setProperty("--on", onColor(settings.accent)); }
  else { r.style.removeProperty("--br"); r.style.removeProperty("--on"); }
  const dark = settings.theme === "system" && globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = THEME_COLORS[settings.theme] || (dark ? THEME_COLORS.dark : THEME_COLORS.light);
  const icon = document.querySelector('link[rel="icon"]'); if (icon) icon.setAttribute("href", settings.theme === "halloween" ? "icons/icon-halloween.svg" : "icons/icon.svg");
  setLang(settings.lang);
}
