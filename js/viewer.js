// Full-screen viewer shell: toolbar, navigation between files, lazy-loaded viewer modules.
import { $, h, fmtB, toast, bar, download } from "./util.js";
import { t, msg } from "./i18n.js";
import * as L from "./library.js";
import { VIEWABLE } from "./detect.js";
import { ask } from "./dialogs.js";

const COLORS = { img: "var(--c-img)", vid: "var(--c-vid)", aud: "var(--c-aud)", sub: "var(--c-sub)", doc: "var(--c-doc)", txt: "var(--c-txt)" };
export const catColor = (c) => COLORS[c] || COLORS.txt;
let cur = null, nav = [], cleanups = [], token = 0, guard = null;
export const current = () => cur;
export const isOpen = () => cur != null;
/** Move to the previous (-1) or next (+1) file of the list the viewer was opened from. */
export function step(d) { const i = nav.findIndex((x) => x.id === cur), n = nav[i + d]; if (n) openViewer(n.id, nav); }

function kindOf(r) {
  const f = r.fmt;
  if (!VIEWABLE.has(f)) return null;
  if (r.cat === "img") return "image";
  if (r.cat === "vid" || r.cat === "aud") return "media";
  if (r.cat === "sub") return "subs";
  if (f === "pdf") return "pdf";
  if (f === "docx" || f === "xlsx") return "docs";
  return "text";
}
const LOADERS = { image: () => import("./viewers/image.js"), media: () => import("./viewers/media.js"), pdf: () => import("./viewers/pdf.js"), text: () => import("./viewers/text.js"), docs: () => import("./viewers/docs.js"), subs: () => import("./viewers/subs.js") };
export const msgBox = (body, text) => { body.textContent = ""; body.append(h("div", { class: "msg" }, text)); };
export const loadingBox = (body, text, p = null) => { body.textContent = ""; body.append(h("div", { class: "msg" }, h("div", { class: "spin" }), text, h("div", { class: p == null ? "prog ind" : "prog" }, h("i", { style: p == null ? "" : `width:${Math.round(p * 100)}%` })))); };

/** Close, asking first when the open editor reports unsaved work (Back button, Esc). */
export async function requestClose() {
  if (guard && guard()) { const ok = await ask({ title: t("Unsaved changes"), message: t("Close without saving? A draft is kept and offered the next time you open this file."), confirm: msg("Close"), danger: true }); if (!ok) return; }
  closeViewer();
}
export function closeViewer() {
  token++; guard = null;
  for (const f of cleanups.reverse()) { try { f(); } catch { /* ignore cleanup errors */ } }
  cleanups = []; cur = null;
  const v = $("#view"); v.hidden = true; v.textContent = "";
  document.body.style.overflow = ""; bar(null);
  L.emit(); // refresh the library behind the viewer
}

export async function openViewer(id, list, opts = {}) {
  const rec = L.byId(id); if (!rec) return;
  if (cur != null) closeViewer();
  const mine = ++token; cur = id; nav = list || L.visible();
  const idx = nav.findIndex((x) => x.id === id), v = $("#view");
  v.hidden = false; v.textContent = ""; document.body.style.overflow = "hidden";
  const go = (d) => { const n = nav[idx + d]; if (n) openViewer(n.id, nav); };
  const ctx = {
    obj(b) { const u = URL.createObjectURL(b); cleanups.push(() => URL.revokeObjectURL(u)); return u; },
    cleanup(f) { cleanups.push(f); },
    save: (n, b) => download(n, b),
    async addCopy(n, b) { await L.addBlob(n, b); toast(t("Saved a copy to your library")); },
    next: () => go(1), prev: () => go(-1), hasNext: () => idx >= 0 && idx < nav.length - 1,
    saveView: () => L.save(rec), alive: () => token === mine, opts, setGuard: (f) => { guard = f; }, open: (i, l, o) => openViewer(i, l, o),
  };

  const fav = h("button", { class: "ic", "aria-pressed": String(!!rec.fav), "aria-label": t("Favorite"), title: t("Favorite"), onclick: async () => { await L.setFav([id], !rec.fav); fav.textContent = rec.fav ? "★" : "☆"; fav.setAttribute("aria-pressed", String(!!rec.fav)); } }, rec.fav ? "★" : "☆");
  const tagsBar = h("div", { class: "tagsbar" });
  const drawTags = () => {
    tagsBar.textContent = "";
    for (const g of rec.tags) tagsBar.append(h("span", { class: "chip", style: "--k:var(--br)" }, "# " + g + " ", h("button", { class: "ghost", style: "min-height:0;padding:0 4px", "aria-label": t("Remove tag {tag}", { tag: g }), onclick: async () => { await L.removeTag([id], g); drawTags(); } }, "×")));
    tagsBar.hidden = !rec.tags.length && !rec.warn;
    if (rec.warn) tagsBar.prepend(h("span", { class: "warn", style: "padding:0 8px" }, "⚠ " + rec.warn));
  };
  const actions = h("div", { class: "vact" },
    fav,
    h("button", { onclick: async () => { const g = await ask({ title: t("Add tag"), input: { placeholder: t("Tag name") }, confirm: msg("Add") }); if (g) { await L.addTag([id], g); drawTags(); } } }, "# " + t("Tag")),
    h("button", { onclick: () => download(rec.name, rec.blob) }, t("Download")),
    rec.trashed
      ? [h("button", { onclick: async () => { await L.restore([id]); closeViewer(); } }, t("Restore")), h("button", { class: "danger", onclick: async () => { if (await ask({ title: t("Delete permanently"), message: t("Delete “{name}” for good?", { name: rec.name }), confirm: msg("Delete permanently"), danger: true })) { await L.purge([id]); closeViewer(); toast(t("Deleted")); } } }, t("Delete permanently"))]
      : h("button", { onclick: async () => { await L.trash([id]); closeViewer(); toast(t("Moved to Trash"), { label: t("Undo"), run: () => L.restore([id]) }); } }, t("Trash")));
  const scrim = h("div", { class: "vscrim", onclick: () => setSheet(false) });
  const more = h("button", { class: "ic vmore", "aria-label": t("More actions"), "aria-expanded": "false", "aria-haspopup": "menu", onclick: () => setSheet(!actions.classList.contains("open")) }, "⋯");
  function setSheet(on) { actions.classList.toggle("open", on); scrim.classList.toggle("open", on); more.setAttribute("aria-expanded", String(on)); }
  actions.addEventListener("click", (e) => { if (e.target.closest("button")) setSheet(false); });
  const toolbar = h("div", { class: "vb" },
    h("button", { onclick: requestClose }, "← " + t("Back")), h("h2", { title: rec.name }, rec.name), h("span", { class: "chip", style: `--k:${catColor(rec.cat)}` }, rec.fmt.toUpperCase() + " · " + fmtB(rec.size)),
    h("button", { class: "ic", disabled: idx < 1, "aria-label": t("Previous file"), title: t("Previous file"), onclick: () => go(-1) }, "‹"),
    h("button", { class: "ic", disabled: idx < 0 || idx >= nav.length - 1, "aria-label": t("Next file"), title: t("Next file"), onclick: () => go(1) }, "›"),
    actions, more);
  const body = h("div", { class: "vbody" });
  v.append(toolbar, tagsBar, body, scrim); drawTags();
  L.markOpened(id);

  const kind = kindOf(rec);
  if (!kind) return msgBox(body, t("Format recognized, but it cannot be previewed in the browser. You can download it."));
  loadingBox(body, t("Opening…")); bar(-1);
  try {
    const mod = await LOADERS[kind]();
    if (token !== mine) return;
    await mod.mount(rec, body, ctx);
  } catch (e) {
    if (token === mine) msgBox(body, String(e?.message || "").startsWith("lib:") ? t("Could not load the preview module. Reload the page and try again.") : t("Could not open the file.") + " " + (e?.message || ""));
  } finally { if (token === mine) bar(null); }
}
