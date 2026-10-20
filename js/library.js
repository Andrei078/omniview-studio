// Library state and operations (no DOM except canvas thumbnails): import, organize, trash, collections.
import * as db from "./db.js";
import { detect, CAT, MIME } from "./detect.js";
import { t } from "./i18n.js";

export const state = { items: [], cols: [], section: "home", colId: null, q: "", sort: "new", mode: "grid", type: "all", sel: new Set() };
const subs = new Set();
export const onChange = (f) => subs.add(f);
export const emit = () => subs.forEach((f) => f());
export const byId = (id) => state.items.find((x) => x.id === id);

export async function load() {
  [state.items, state.cols] = await Promise.all([db.files.all(), db.cols.all()]);
  state.sel.clear(); emit();
}

async function fingerprint(f) {
  try {
    const d = await crypto.subtle.digest("SHA-256", await f.slice(0, 1 << 20).arrayBuffer());
    return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("") + ":" + f.size;
  } catch { return f.name + ":" + f.size + ":" + (f.lastModified || 0); }
}

async function imageThumb(file) {
  const bm = await createImageBitmap(file, { resizeWidth: 320, resizeQuality: "medium" });
  const c = document.createElement("canvas"); c.width = bm.width; c.height = bm.height;
  c.getContext("2d").drawImage(bm, 0, 0); bm.close?.();
  return new Promise((r) => c.toBlob(r, "image/jpeg", 0.72));
}
function videoThumb(file) {
  return new Promise((ok) => {
    const v = document.createElement("video"), u = URL.createObjectURL(file), end = (b) => { URL.revokeObjectURL(u); v.removeAttribute("src"); ok(b); };
    const timer = setTimeout(() => end(null), 4000);
    v.muted = true; v.preload = "metadata"; v.src = u;
    v.onloadeddata = () => { v.currentTime = Math.min(1, (v.duration || 2) / 4); };
    v.onseeked = () => {
      const c = document.createElement("canvas"), s = 320 / (v.videoWidth || 320); c.width = 320; c.height = Math.round((v.videoHeight || 180) * s);
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); clearTimeout(timer); c.toBlob((b) => end(b), "image/jpeg", 0.72);
    };
    v.onerror = () => { clearTimeout(timer); end(null); };
  });
}
export async function makeThumb(file, fmt) {
  try {
    if (CAT[fmt] === "img" && !["svg", "heic", "tiff"].includes(fmt) && typeof createImageBitmap === "function") return await imageThumb(file);
    if (CAT[fmt] === "vid" && ["mp4", "webm", "mov"].includes(fmt)) return await videoThumb(file);
  } catch { /* thumbnails are optional */ }
  return null;
}

function newRecord(file, d, fp, thumb) {
  return { name: file.name, fmt: d.f, cat: CAT[d.f] || "txt", size: file.size, added: Date.now(), opened: 0, fav: 0, tags: [], cols: [], trashed: 0, fp, warn: d.warn, view: {}, blob: new Blob([file], { type: MIME[d.f] || file.type }), thumb };
}

/** Import files. Reports what happened; never throws for a single bad file. */
export async function importFiles(files, { onProgress, signal } = {}) {
  files = [...files];
  const rep = { ok: [], dup: 0, restored: 0, bad: [], quota: false, cancelled: false };
  try { await navigator.storage?.persist?.(); } catch { /* optional */ }
  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) { rep.cancelled = true; break; }
    const f = files[i]; onProgress?.(i, files.length, f.name);
    try {
      const d = detect(new Uint8Array(await f.slice(0, 4096).arrayBuffer()), f.name);
      if (d.f === "bin") { rep.bad.push({ name: f.name, reason: t("unrecognized file format") }); continue; }
      const fp = await fingerprint(f), same = state.items.find((x) => x.fp === fp);
      if (same) { if (same.trashed) { same.trashed = 0; await db.files.put(same); rep.restored++; } else rep.dup++; continue; }
      const rec = newRecord(f, d, fp, await makeThumb(f, d.f));
      rec.added += i; rec.id = await db.files.put(rec); state.items.push(rec); rep.ok.push(rec.id);
    } catch (e) {
      if (e?.name === "QuotaExceededError") { rep.quota = true; break; }
      rep.bad.push({ name: f.name, reason: String(e?.message || e) });
    }
  }
  onProgress?.(files.length, files.length, "");
  emit(); return rep;
}

/** Add generated content (e.g. an edited image) as a new library item. */
export async function addBlob(name, blob) {
  const d = detect(new Uint8Array(await blob.slice(0, 4096).arrayBuffer()), name);
  const file = new File([blob], name, { type: blob.type });
  const rec = newRecord(file, d, await fingerprint(file), await makeThumb(file, d.f));
  rec.id = await db.files.put(rec); state.items.push(rec); emit(); return rec;
}

export async function patch(ids, fn) {
  for (const id of ids) { const r = byId(id); if (r) { fn(r); await db.files.put(r); } }
  emit();
}
export const save = (rec) => patch([rec.id], () => {});
export const setFav = (ids, v) => patch(ids, (r) => { r.fav = v ? 1 : 0; });
export const trash = (ids) => patch(ids, (r) => { r.trashed = Date.now(); });
export const restore = (ids) => patch(ids, (r) => { r.trashed = 0; });
export const markOpened = (id) => patch([id], (r) => { r.opened = Date.now(); });
export const addTag = (ids, tag) => { tag = tag.trim(); return tag ? patch(ids, (r) => { if (!r.tags.includes(tag)) r.tags.push(tag); }) : Promise.resolve(); };
export const removeTag = (ids, tag) => patch(ids, (r) => { r.tags = r.tags.filter((x) => x !== tag); });
export async function purge(ids) {
  for (const id of ids) { await db.files.del(id); state.items = state.items.filter((x) => x.id !== id); state.sel.delete(id); }
  emit();
}
export async function emptyTrash() { await purge(state.items.filter((i) => i.trashed).map((i) => i.id)); }
export async function wipe() { await db.files.clear(); await db.cols.clear(); state.items = []; state.cols = []; state.sel.clear(); emit(); }

// collections
export async function createCol(name) {
  name = name.trim(); if (!name) return null;
  let c = state.cols.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!c) { c = { name }; c.id = await db.cols.put(c); state.cols.push(c); }
  emit(); return c;
}
export async function renameCol(id, name) { const c = state.cols.find((x) => x.id === id); if (c && name.trim()) { c.name = name.trim(); await db.cols.put(c); emit(); } }
export async function deleteCol(id) {
  await db.cols.del(id); state.cols = state.cols.filter((x) => x.id !== id);
  await patch(state.items.filter((i) => i.cols.includes(id)).map((i) => i.id), (r) => { r.cols = r.cols.filter((x) => x !== id); });
}
export const addToCol = (ids, colId) => patch(ids, (r) => { if (!r.cols.includes(colId)) r.cols.push(colId); });
export const removeFromCol = (ids, colId) => patch(ids, (r) => { r.cols = r.cols.filter((x) => x !== colId); });

// queries
const SORTS = {
  new: (a, b) => b.added - a.added, name: (a, b) => a.name.localeCompare(b.name), size: (a, b) => b.size - a.size,
  type: (a, b) => a.fmt.localeCompare(b.fmt) || a.name.localeCompare(b.name),
};
export function visible() {
  const { section, colId, q, sort, type } = state, needle = q.trim().toLowerCase();
  let r = state.items.filter((i) => (section === "trash" ? i.trashed : !i.trashed));
  if (section === "recent") r = r.filter((i) => i.opened).sort((a, b) => b.opened - a.opened);
  else if (["img", "vid", "aud", "sub"].includes(section)) r = r.filter((i) => i.cat === section);
  else if (section === "doc") r = r.filter((i) => i.cat === "doc" || i.cat === "txt");
  else if (section === "fav") r = r.filter((i) => i.fav);
  else if (section === "col") r = r.filter((i) => i.cols.includes(colId));
  if (type !== "all") r = r.filter((i) => i.fmt === type);
  if (needle) r = r.filter((i) => i.name.toLowerCase().includes(needle) || i.fmt.includes(needle) || i.tags.some((x) => x.toLowerCase().includes(needle)));
  if (section !== "recent") r = r.sort(SORTS[sort] || SORTS.new);
  return r;
}
export function counts() {
  const live = state.items.filter((i) => !i.trashed), c = { all: live.length, img: 0, vid: 0, aud: 0, sub: 0, doc: 0, fav: 0, trash: state.items.length - live.length, recent: 0 };
  for (const i of live) { if (i.cat === "img" || i.cat === "vid" || i.cat === "aud" || i.cat === "sub") c[i.cat]++; else c.doc++; if (i.fav) c.fav++; if (i.opened) c.recent++; }
  return c;
}
export const totalSize = () => state.items.reduce((s, i) => s + i.size, 0);

/** Insert a fully formed record (used by backup restore). */
export async function insert(rec) { rec.id = await db.files.put(rec); state.items.push(rec); return rec; }
