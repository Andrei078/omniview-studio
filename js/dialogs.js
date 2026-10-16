// Modal dialogs: ask (confirm / text / choice), settings, shortcuts, onboarding.
import { h, fmtB, toast } from "./util.js";
import { t, msg, LANGS } from "./i18n.js";
import { settings, update, DEFAULTS } from "./settings.js";
import * as L from "./library.js";

let lastFocus = null;
function modal(box) {
  lastFocus = document.activeElement;
  const back = h("div", { class: "dlg-b" }, box);
  const close = () => { back.remove(); lastFocus?.focus?.(); };
  back.onclick = (e) => { if (e.target === back) back.dispatchEvent(new CustomEvent("dismiss")); };
  back.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); back.dispatchEvent(new CustomEvent("dismiss")); } });
  document.body.append(back);
  return { back, close };
}

/** ask({title, message, input, select, confirm, danger}) -> true | text | choice | null (cancel). */
export function ask({ title, message, input, select, confirm = msg("OK"), danger = false, cancel = msg("Cancel") }) {
  return new Promise((done) => {
    const field = input !== undefined ? h("input", { type: "text", value: input.value || "", placeholder: input.placeholder || "", "aria-label": title }) : select ? h("select", { "aria-label": title }, select.map((o) => h("option", { value: o.v }, o.l))) : null;
    const finish = (v) => { m.close(); done(v); };
    const ok = h("button", { class: danger ? "pri danger" : "pri", onclick: () => finish(field ? (field.value.trim() || (select ? field.value : null)) : true) }, t(confirm));
    const box = h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": title }, h("header", {}, title), h("div", { class: "c" }, message ? h("div", {}, message) : null, field), h("footer", {}, h("button", { onclick: () => finish(field ? null : false) }, t(cancel)), ok));
    const m = modal(box);
    m.back.addEventListener("dismiss", () => finish(field ? null : false));
    if (field && field.tagName === "INPUT") field.addEventListener("keydown", (e) => { if (e.key === "Enter") ok.click(); });
    (field || ok).focus();
  });
}

export const SHORTCUTS = [
  ["Ctrl+O", msg("Import files")], ["Ctrl+Shift+O", msg("Import folder")], ["/  or  Ctrl+F", msg("Search")], ["← →", msg("Previous / next file")], ["Esc", msg("Close viewer or dialog")],
  ["Ctrl+S", msg("Save changes (text editor)")], ["Ctrl+Z / Ctrl+Y", msg("Undo / redo in the active editor")], ["Delete", msg("Move selected files to Trash")], ["Ctrl+A", msg("Select all visible files")], ["Ctrl+,", msg("Settings")], ["?", msg("Keyboard shortcuts")],
];
const TABS = [msg("General"), msg("Appearance"), msg("Library"), msg("Data"), msg("Shortcuts"), msg("About")];

export function openSettings(tab = "General", hooks = {}) {
  let cur = tab;
  const content = h("div", { class: "c" }), tabs = h("div", { class: "row", style: "justify-content:flex-start;padding:10px 18px 0" });
  const sel = (key, opts) => h("select", { onchange: (e) => { update({ [key]: typeof DEFAULTS[key] === "number" ? Number(e.target.value) : e.target.value }); draw(); } }, opts.map(([v, l]) => h("option", { value: v, selected: String(settings[key]) === String(v) }, l)));
  const fld = (label, ctl, hint) => h("label", { class: "fld" }, h("span", {}, label, hint ? h("small", {}, hint) : null), ctl);
  async function data() {
    const est = (await navigator.storage?.estimate?.().catch(() => null)) || {};
    const file = h("input", { type: "file", accept: ".zip", hidden: true, onchange: async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) hooks.restore?.(f); } });
    content.append(
      fld(t("Stored in this browser"), h("span", {}, fmtB(L.totalSize()) + (est.usage ? " · " + t("browser total {n}", { n: fmtB(est.usage) }) : "")), t("Your files never leave this device.")),
      fld(t("Backup"), h("span", { class: "row" }, h("button", { onclick: () => hooks.backup?.() }, t("Export library (.zip)")), h("button", { onclick: () => file.click() }, t("Restore from backup…")), file), t("A single ZIP with all files, tags and collections. Large libraries need enough free memory.")),
      fld(t("Delete everything"), h("button", { class: "danger", onclick: async () => { if (await ask({ title: t("Delete everything"), message: t("Remove every file, tag and collection from this browser? This cannot be undone. Export a backup first if you need one."), confirm: msg("Delete everything"), danger: true })) { await L.wipe(); toast(t("Library cleared.")); draw(); } } }, t("Delete all data…"))));
  }
  function draw() {
    content.textContent = ""; tabs.textContent = "";
    TABS.forEach((x) => tabs.append(h("button", { class: x === cur ? "on" : "", onclick: () => { cur = x; draw(); } }, t(x))));
    if (cur === "General") content.append(
      fld(t("Language"), sel("lang", [["system", t("System default")], ...LANGS.map((l) => [l.code, l.name])])),
      fld(t("Play next track automatically"), h("input", { type: "checkbox", checked: settings.autoNext, onchange: (e) => update({ autoNext: e.target.checked }) })),
      fld(t("Waveform analysis limit"), sel("waveMb", [[8, "8 MB"], [16, "16 MB"], [32, "32 MB"], [64, "64 MB"]]), t("Bigger audio files are played without a waveform to save memory.")));
    if (cur === "Appearance") content.append(
      fld(t("Theme"), sel("theme", [["system", t("System")], ["light", t("Light")], ["dark", t("Dark")]])),
      fld(t("Accent color"), h("input", { type: "color", value: settings.accent, onchange: (e) => update({ accent: e.target.value }) })),
      fld(t("Interface size"), sel("scale", [[90, "90%"], [100, "100%"], [110, "110%"], [120, "120%"]])),
      fld(t("Density"), sel("density", [["comfortable", t("Comfortable")], ["compact", t("Compact")]])));
    if (cur === "Library") content.append(fld(t("Default view"), sel("view", [["grid", t("Grid")], ["list", t("List")]])));
    if (cur === "Data") data();
    if (cur === "Shortcuts") content.append(h("table", { class: "keys" }, SHORTCUTS.map(([k, d]) => h("tr", {}, h("td", {}, h("kbd", {}, k)), h("td", {}, t(d))))));
    if (cur === "About") content.append(h("p", {}, t("OmniView opens images, video, audio, PDF, Word, Excel, CSV and text files directly in your browser. The real file format is detected from the content. Nothing is uploaded: files are stored on this device only.")), h("p", { class: "fine", style: "text-align:left;margin:0" }, "PDF.js (Apache-2.0) · mammoth (BSD-2) · DOMPurify (MPL-2.0/Apache-2.0) · SheetJS (Apache-2.0) · fflate (MIT)"));
  }
  const m = modal(h("div", { class: "dlg wide", role: "dialog", "aria-modal": "true", "aria-label": t("Settings") }, h("header", {}, t("Settings")), tabs, content, h("footer", {}, h("button", { class: "pri", onclick: () => m.close() }, t("Close")))));
  m.back.addEventListener("dismiss", m.close);
  draw();
}

export function onboarding(onDone) {
  const steps = [[msg("Import anything"), msg("Drop files or folders anywhere on the page, or press “Import files”. The real format is detected from the content; the extension is only a hint.")], [msg("Your files stay yours"), msg("Everything is stored in this browser. Nothing is uploaded, and edits never change your originals unless you export or save a copy.")], [msg("Organize and come back"), msg("Use favorites, tags and collections. Your library is saved automatically; export a backup any time from Settings → Data.")]];
  let i = 0; const c = h("div", { class: "c" }), next = h("button", { class: "pri" });
  const draw = () => { c.textContent = ""; c.append(h("h3", { style: "margin:0" }, t(steps[i][0])), h("p", { style: "margin:0;color:var(--mut)" }, t(steps[i][1]))); next.textContent = i < steps.length - 1 ? t("Next") : t("Get started"); };
  const m = modal(h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": t("Welcome") }, h("header", {}, t("Welcome to OmniView")), c, h("footer", {}, h("button", { onclick: () => { m.close(); onDone(); } }, t("Skip")), next)));
  next.onclick = () => { if (i < steps.length - 1) { i++; draw(); } else { m.close(); onDone(); } };
  m.back.addEventListener("dismiss", () => { m.close(); onDone(); });
  draw(); next.focus();
}

export function importReport(rep) {
  const rows = [...rep.bad.map((b) => [b.name, b.reason])];
  const box = h("div", { class: "dlg", role: "dialog", "aria-modal": "true", "aria-label": t("Import summary") }, h("header", {}, t("Import summary")),
    h("div", { class: "c" }, h("div", {}, t("{ok} imported, {dup} duplicate(s) skipped, {bad} not imported.", { ok: rep.ok.length, dup: rep.dup, bad: rep.bad.length })), rep.quota ? h("div", { class: "warn" }, t("Not enough browser storage. Delete files and try again.")) : null,
      rows.length ? h("table", { class: "keys" }, rows.slice(0, 50).map(([n, r]) => h("tr", {}, h("td", {}, n), h("td", { style: "color:var(--mut)" }, r)))) : null), h("footer", {}, h("button", { class: "pri", onclick: () => m.close() }, t("Close"))));
  const m = modal(box); m.back.addEventListener("dismiss", m.close);
}
