// English text is the key. Missing translations fall back to English. `{name}` placeholders are interpolated.
import { RO } from "./lang/ro.js";

export const LANGS = [{ code: "en", name: "English" }, { code: "ro", name: "Română" }];
const DICT = { ro: RO };
let lang = "en";
const subs = new Set();

export function resolveLang(pref, nav = globalThis.navigator?.language ?? "en") {
  if (pref && pref !== "system" && LANGS.some((l) => l.code === pref)) return pref;
  const n = nav.toLowerCase();
  return LANGS.find((l) => n === l.code || n.startsWith(l.code + "-"))?.code ?? "en";
}
export const getLang = () => lang;
export const onLang = (f) => subs.add(f);
export function setLang(pref) {
  lang = resolveLang(pref);
  if (globalThis.document) { document.documentElement.lang = lang; applyI18n(); }
  subs.forEach((f) => f(lang));
}
export function translate(code, text, params) {
  const base = code === "en" ? text : DICT[code]?.[text] ?? text;
  return params ? base.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : base;
}
export const t = (text, params) => translate(lang, text, params);
/** Marks a string for translation without translating it yet (tables built at load time). */
export const msg = (text) => text;

/** Static HTML: data-i (text), data-ip (placeholder), data-it (title + aria-label). */
export function applyI18n(root = document) {
  root.querySelectorAll("[data-i]").forEach((e) => { e.textContent = t(e.dataset.i); });
  root.querySelectorAll("[data-ip]").forEach((e) => { e.placeholder = t(e.dataset.ip); });
  root.querySelectorAll("[data-it]").forEach((e) => { const v = t(e.dataset.it); e.title = v; e.setAttribute("aria-label", v); });
}
