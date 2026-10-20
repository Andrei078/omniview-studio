// Library UI: sidebar, home, grid/list, collections, selection, context menu, import with progress.
import { $, h, fmtB, bar, toast, download, logo, put } from "./util.js";
import { t, msg } from "./i18n.js";
import * as L from "./library.js";
import { ask, importReport } from "./dialogs.js";
import { openViewer, catColor } from "./viewer.js";

const NAV = [
  [null, [["home", msg("Home"), "⌂"], ["recent", msg("Recent"), "◷"], ["all", msg("All files"), "▦"]]],
  [msg("Browse"), [["img", msg("Images"), "🖼", "var(--c-img)"], ["vid", msg("Video"), "▶", "var(--c-vid)"], ["aud", msg("Audio"), "♪", "var(--c-aud)"], ["sub", msg("Subtitles"), "CC", "var(--c-sub)"], ["doc", msg("Documents"), "▤", "var(--c-doc)"], ["fav", msg("Favorites"), "★"]]],
  [msg("Organize"), [["cols", msg("Collections"), "▣"], ["trash", msg("Trash"), "🗑"]]],
];
const TITLES = { recent: msg("Recent"), all: msg("All files"), img: msg("Images"), vid: msg("Video"), aud: msg("Audio"), sub: msg("Subtitles"), doc: msg("Documents"), fav: msg("Favorites"), trash: msg("Trash") };
const CHUNK = 120;
let limit = CHUNK, ctxMenu = null, io = null;
const thumbUrls = new Map();
const thumbUrl = (r) => { let u = thumbUrls.get(r.id); if (!u && (r.thumb || r.fmt === "svg")) { u = URL.createObjectURL(r.thumb || r.blob); thumbUrls.set(r.id, u); } return u; };

export function setSection(id, colId = null) {
  L.state.section = id; L.state.colId = colId; L.state.type = "all"; L.state.sel.clear(); limit = CHUNK;
  closeCtx(); L.emit();
}
export function setAndScroll(id, colId) { setSection(id, colId); window.scrollTo(0, 0); }

export function renderNav() {
  const nav = $("#nav"), c = L.counts(); nav.textContent = "";
  for (const [grp, items] of NAV) {
    if (grp) nav.append(h("div", { class: "grp" }, t(grp)));
    for (const [id, label, icon, color] of items) {
      const on = L.state.section === id;
      const n = id === "home" ? "" : id === "cols" ? L.state.cols.length : c[id];
      nav.append(h("button", { class: on ? "on" : "", "aria-current": on ? "page" : null, title: t(label), onclick: () => setAndScroll(id) }, h("span", { class: "ico", "aria-hidden": "true", style: color ? `color:${color}` : "" }, icon || ""), h("span", { class: "lbl" }, t(label)), n ? h("span", { class: "n" }, n) : null));
      if (id === "cols") for (const col of L.state.cols) nav.append(h("button", { class: "sub" + (L.state.section === "col" && L.state.colId === col.id ? " on" : ""), onclick: () => setAndScroll("col", col.id) }, h("span", { class: "lbl" }, col.name), h("span", { class: "n" }, L.state.items.filter((i) => !i.trashed && i.cols.includes(col.id)).length)));
    }
  }
}

// ---------- import ----------
let importing = false;
export async function importUI(files) {
  files = [...files]; if (!files.length || importing) return;
  importing = true; const ac = new AbortController();
  try {
    const rep = await L.importFiles(files, { signal: ac.signal, onProgress: (i, n, name) => { bar(i / n); if (i < n) toast(t("Importing {i} of {n}: {name}", { i: i + 1, n, name }), { label: t("Cancel"), run: () => ac.abort() }); } });
    bar(null);
    const parts = [rep.ok.length && t("{n} imported", { n: rep.ok.length }), rep.restored && t("{n} restored from Trash", { n: rep.restored }), rep.dup && t("{n} duplicate(s) skipped", { n: rep.dup }), rep.bad.length && t("{n} not imported", { n: rep.bad.length }), rep.cancelled && t("cancelled")].filter(Boolean);
    toast(parts.join(" · ") || t("Nothing to import."));
    if (rep.bad.length || rep.quota) importReport(rep);
  } finally { importing = false; bar(null); }
}

// ---------- helpers ----------
const ids = () => [...L.state.sel];
async function pickCollection() {
  const NEW = "__new__";
  const v = await ask({ title: t("Add to collection"), select: [...L.state.cols.map((c) => ({ v: String(c.id), l: c.name })), { v: NEW, l: "+ " + t("New collection…") }], confirm: msg("Add") });
  if (v == null) return null;
  if (v !== NEW) return L.state.cols.find((c) => String(c.id) === v);
  const name = await ask({ title: t("New collection"), input: { placeholder: t("Collection name") }, confirm: msg("Create") });
  return name ? L.createCol(name) : null;
}
const act = {
  async tag(list) { const g = await ask({ title: t("Add tag"), input: { placeholder: t("Tag name") }, confirm: msg("Add") }); if (g) { await L.addTag(list, g); toast(t("Tag “{tag}” added", { tag: g })); } },
  async col(list) { const c = await pickCollection(); if (c) { await L.addToCol(list, c.id); toast(t("Added to “{name}”", { name: c.name })); } },
  async trash(list) { await L.trash(list); L.state.sel.clear(); toast(t("Moved to Trash"), { label: t("Undo"), run: () => L.restore(list) }); },
  async purge(list) { if (await ask({ title: t("Delete permanently"), message: t("Delete {n} file(s) for good? This cannot be undone.", { n: list.length }), confirm: msg("Delete permanently"), danger: true })) { await L.purge(list); toast(t("Deleted")); } },
};
function closeCtx() { ctxMenu?.remove(); ctxMenu = null; }
function showCtx(e, r) {
  e.preventDefault(); closeCtx();
  const one = [r.id], b = (label, fn, cls) => h("button", { class: cls || "", role: "menuitem", onclick: () => { closeCtx(); fn(); } }, label);
  ctxMenu = h("div", { class: "ctx", role: "menu", style: `left:${Math.min(e.clientX, innerWidth - 220)}px;top:${Math.min(e.clientY, innerHeight - 300)}px` },
    b(t("Open"), () => openFrom(r)), r.trashed ? b(t("Restore"), () => L.restore(one)) : [
      b(r.fav ? t("Remove from favorites") : t("Add to favorites"), () => L.setFav(one, !r.fav)), b(t("Add tag…"), () => act.tag(one)), b(t("Add to collection…"), () => act.col(one)),
      L.state.section === "col" ? b(t("Remove from this collection"), () => L.removeFromCol(one, L.state.colId)) : null, b(t("Download"), () => download(r.name, r.blob)), b(t("Move to Trash"), () => act.trash(one), "danger")],
    r.trashed ? b(t("Delete permanently"), () => act.purge(one), "danger") : null);
  document.body.append(ctxMenu); ctxMenu.querySelector("button")?.focus();
}
const openFrom = (r) => openViewer(r.id, L.visible());
let noClickUntil = 0; // a long-press selects; the click that follows the release must not also open the file
// The selection bar appears above the list and shifts it, so the click generated when the finger lifts can land on one of
// its buttons (Trash!). Swallow every click for a moment after a long-press.
document.addEventListener("click", (e) => { if (Date.now() < noClickUntil) { e.stopPropagation(); e.preventDefault(); } }, true);

// ---------- cards ----------
function card(r, selectable = true) {
  const u = thumbUrl(r), sel = L.state.sel.has(r.id);
  let press = 0, longPressed = false; const cancel = () => clearTimeout(press);
  const release = () => { cancel(); if (longPressed) { longPressed = false; noClickUntil = Date.now() + 450; } }; // block the click generated by lifting the finger
  const toggle = () => { sel ? L.state.sel.delete(r.id) : L.state.sel.add(r.id); L.emit(); };
  return h("div", { class: "card" + (sel ? " sel" : ""), style: `--k:${catColor(r.cat)}`, role: "button", tabindex: 0, "data-id": r.id, "aria-label": r.name, title: r.name,
    onclick: (e) => { if (Date.now() < noClickUntil) return; selectable && (L.state.sel.size || e.ctrlKey || e.metaKey) ? toggle() : openFrom(r); },
    ontouchstart: () => { if (selectable) press = setTimeout(() => { longPressed = true; noClickUntil = Date.now() + 8000; navigator.vibrate?.(12); toggle(); }, 480); }, ontouchmove: cancel, ontouchend: release, ontouchcancel: release,
    onkeydown: (e) => { if (e.key === "Enter") openFrom(r); else if (e.key === " " && selectable) { e.preventDefault(); toggle(); } },
    oncontextmenu: (e) => showCtx(e, r) },
    selectable ? h("button", { class: "ck", "aria-label": t("Select"), "aria-pressed": String(sel), onclick: (e) => { e.stopPropagation(); toggle(); } }, sel ? "✓" : "") : null,
    h("button", { class: "more", "aria-label": t("More actions"), "aria-haspopup": "menu", onclick: (e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); showCtx({ preventDefault() {}, clientX: b.left, clientY: b.bottom }, r); } }, "⋯"),
    h("div", { class: "th" }, u ? h("img", { src: u, alt: "", loading: "lazy", decoding: "async" }) : r.fmt.toUpperCase()),
    h("div", { class: "mt" }, h("b", {}, (r.fav ? "★ " : "") + r.name), h("small", {}, fmtB(r.size) + " · " + r.fmt.toUpperCase() + (r.tags.length ? " · " + r.tags.join(", ") : ""))));
}

// ---------- views ----------
function home(m) {
  const items = L.state.items.filter((i) => !i.trashed);
  if (!items.length) {
    m.append(h("section", { class: "hero", id: "hero" }, logo(), h("h1", {}, t("Any file. One place.")), h("p", {}, t("Drop images, video, audio, PDF, Word, Excel, CSV or text here. The real format is detected from the content, and your files stay in this browser: nothing is uploaded.")),
      h("div", { class: "row" }, h("button", { class: "pri", onclick: () => $("#fi").click() }, t("Import files")), h("button", { onclick: () => $("#fo").click() }, t("Import folder")))),
      h("p", { class: "fine" }, t("Works offline once loaded. Your library is saved automatically on this device.")));
    return;
  }
  const c = L.counts();
  m.append(h("div", { class: "tools" }, h("h2", {}, t("Welcome back"))),
    h("div", { class: "stats" }, [[c.all, t("Files")], [fmtB(L.totalSize()), t("Stored here")], [c.img, t("Images")], [c.vid + c.aud, t("Video & audio")], [c.doc, t("Documents")]].map(([n, l]) => h("div", { class: "stat" }, h("b", {}, n), h("span", {}, l)))));
  const strip = (title, list, sec) => list.length ? h("section", {}, h("div", { class: "tools" }, h("h2", { style: "font-size:1.1rem" }, title), h("span", { class: "sp" }), h("button", { class: "ghost", onclick: () => setAndScroll(sec) }, t("See all") + " →")), h("div", { class: "strip" }, list.map((i) => card(i, false)))) : null;
  put(m, strip(t("Recently opened"), items.filter((i) => i.opened).sort((a, b) => b.opened - a.opened).slice(0, 12), "recent"), strip(t("Recently added"), [...items].sort((a, b) => b.added - a.added).slice(0, 12), "all"), h("div", { class: "hero", style: "padding:26px" }, h("p", {}, t("Drop more files anywhere on this page")), h("div", { class: "row" }, h("button", { class: "pri", onclick: () => $("#fi").click() }, t("Import files")), h("button", { onclick: () => $("#fo").click() }, t("Import folder")))));
}

function colsView(m) {
  m.append(h("div", { class: "tools" }, h("h2", {}, t("Collections")), h("span", { class: "sp" }), h("button", { class: "pri", onclick: async () => { const n = await ask({ title: t("New collection"), input: { placeholder: t("Collection name") }, confirm: msg("Create") }); if (n) await L.createCol(n); } }, "+ " + t("New collection"))));
  if (!L.state.cols.length) return m.append(h("div", { class: "empty" }, h("h3", {}, t("No collections yet")), h("span", {}, t("Select files, then choose “Add to collection”."))));
  m.append(h("div", { class: "grid" }, L.state.cols.map((c) => {
    const n = L.state.items.filter((i) => !i.trashed && i.cols.includes(c.id)).length;
    return h("div", { class: "card", style: "padding:16px", role: "button", tabindex: 0, onclick: () => setAndScroll("col", c.id), onkeydown: (e) => { if (e.key === "Enter") setAndScroll("col", c.id); } }, h("b", { style: "font-size:1.1rem" }, c.name), h("div", { style: "color:var(--mut)" }, t("{n} file(s)", { n })),
      h("div", { class: "row", style: "justify-content:flex-start;margin-top:10px" },
        h("button", { onclick: async (e) => { e.stopPropagation(); const v = await ask({ title: t("Rename collection"), input: { value: c.name } }); if (v) L.renameCol(c.id, v); } }, t("Rename")),
        h("button", { class: "danger", onclick: async (e) => { e.stopPropagation(); if (await ask({ title: t("Delete collection"), message: t("Delete “{name}”? Files stay in the library.", { name: c.name }), confirm: msg("Delete"), danger: true })) { await L.deleteCol(c.id); if (L.state.colId === c.id) setSection("cols"); } } }, t("Delete"))));
  })));
}

function listView(m) {
  const { section, sel } = L.state, saveType = L.state.type;
  L.state.type = "all"; const pool = L.visible(); L.state.type = saveType;
  const list = L.visible(), types = [...new Set(pool.map((i) => i.fmt))].sort();
  const title = section === "col" ? L.state.cols.find((c) => c.id === L.state.colId)?.name || "" : t(TITLES[section]);
  m.append(h("div", { class: "tools lt" }, h("h2", {}, title), h("span", { class: "badge" }, list.length), h("span", { class: "sp" }), h("span", { class: "br" }),
    types.length > 1 ? h("select", { "aria-label": t("Filter by type"), onchange: (e) => { L.state.type = e.target.value; limit = CHUNK; L.emit(); } }, h("option", { value: "all" }, t("All types")), types.map((x) => h("option", { value: x, selected: L.state.type === x }, x.toUpperCase()))) : null,
    h("select", { "aria-label": t("Sort by"), onchange: (e) => { L.state.sort = e.target.value; L.emit(); } }, [["new", t("Newest first")], ["name", t("Name")], ["size", t("Size")], ["type", t("Type")]].map(([v, l]) => h("option", { value: v, selected: L.state.sort === v }, l))),
    h("button", { class: "ic tg", title: L.state.mode === "grid" ? t("List view") : t("Grid view"), "aria-label": L.state.mode === "grid" ? t("List view") : t("Grid view"), onclick: () => { L.state.mode = L.state.mode === "grid" ? "list" : "grid"; L.emit(); } }, L.state.mode === "grid" ? "☰" : "▦"),
    section === "trash" && list.length ? h("button", { class: "danger", onclick: async () => { if (await ask({ title: t("Empty Trash"), message: t("Permanently delete everything in the Trash?"), confirm: msg("Empty Trash"), danger: true })) { await L.emptyTrash(); toast(t("Trash emptied")); } } }, t("Empty Trash")) : null));
  if (sel.size) {
    const ids_ = ids();
    m.append(h("div", { class: "sel-bar", role: "toolbar", "aria-label": t("Batch actions") }, h("b", {}, t("{n} selected", { n: sel.size })),
      section === "trash" ? [h("button", { onclick: () => { L.restore(ids_); sel.clear(); } }, t("Restore")), h("button", { class: "danger", onclick: () => act.purge(ids_) }, t("Delete permanently"))]
        : [h("button", { onclick: () => L.setFav(ids_, true) }, "★ " + t("Favorite")), h("button", { onclick: () => act.tag(ids_) }, "# " + t("Tag")), h("button", { onclick: () => act.col(ids_) }, t("Add to collection")), h("button", { class: "danger", onclick: () => act.trash(ids_) }, t("Trash"))],
      h("button", { onclick: () => { list.forEach((i) => sel.add(i.id)); L.emit(); } }, t("Select all")), h("button", { class: "ghost", onclick: () => { sel.clear(); L.emit(); } }, t("Clear"))));
  }
  if (!list.length) return m.append(h("div", { class: "empty" }, h("h3", {}, t("Nothing here")), h("span", {}, L.state.q ? t("No files match your search.") : section === "trash" ? t("The Trash is empty.") : t("No files in this section yet."))));
  const grid = h("div", { class: (L.state.mode === "grid" ? "grid" : "list") + (sel.size ? " selecting" : "") }, list.slice(0, limit).map((r) => card(r)));
  m.append(grid);
  if (list.length > limit) {
    const more = h("div", { class: "row", style: "margin-top:16px" }, h("button", { onclick: () => { limit += CHUNK; L.emit(); } }, t("Show more") + " (" + (list.length - limit) + ")"));
    m.append(more); io?.disconnect();
    if (typeof IntersectionObserver === "function") { io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { limit += CHUNK; L.emit(); } }, { rootMargin: "500px" }); io.observe(more); }
  }
}

export function renderMain() {
  const m = $("#main"), y = scrollY; m.textContent = "";
  const s = L.state.section;
  if (s === "home") home(m); else if (s === "cols") colsView(m); else listView(m);
  scrollTo(0, y);
}
export function render() { renderNav(); renderMain(); $("#app").classList.toggle("collapsed", false); }
document.addEventListener("click", (e) => { if (ctxMenu && !ctxMenu.contains(e.target)) closeCtx(); });
export { closeCtx };
