// Backup / restore of the whole library as a ZIP (manifest.json + files/). Everything stays on the device.
import * as L from "./library.js";
import { MIME } from "./detect.js";
import { lib } from "./util.js";
import { t } from "./i18n.js";

const safe = (n) => n.replace(/[\\/:*?"<>|]/g, "_");

export async function exportBackup(onProgress) {
  const f = await lib("fflate"), entries = {}, items = [], colName = (id) => L.state.cols.find((c) => c.id === id)?.name;
  let i = 0;
  for (const r of L.state.items) {
    onProgress?.(i++ / L.state.items.length);
    const path = `files/${r.id}__${safe(r.name)}`;
    entries[path] = [new Uint8Array(await r.blob.arrayBuffer()), { level: 0 }]; // already-compressed media: store only
    items.push({ name: r.name, fmt: r.fmt, cat: r.cat, size: r.size, added: r.added, opened: r.opened, fav: r.fav, tags: r.tags, trashed: r.trashed, fp: r.fp, warn: r.warn, view: r.view, cols: r.cols.map(colName).filter(Boolean), file: path });
  }
  entries["manifest.json"] = f.strToU8(JSON.stringify({ app: "omniview", version: 1, exported: Date.now(), collections: L.state.cols.map((c) => c.name), items }));
  onProgress?.(1);
  return new Blob([f.zipSync(entries)], { type: "application/zip" });
}

export async function importBackup(file) {
  const f = await lib("fflate");
  let files;
  try { files = f.unzipSync(new Uint8Array(await file.arrayBuffer())); } catch { throw new Error(t("This is not a valid backup file.")); }
  let m;
  try { m = JSON.parse(f.strFromU8(files["manifest.json"])); } catch { throw new Error(t("This is not a valid backup file.")); }
  if (m.app !== "omniview" || !Array.isArray(m.items)) throw new Error(t("This is not a valid backup file."));
  if (m.version !== 1) throw new Error(t("This backup was made by a newer version."));
  const colIds = {};
  for (const name of m.collections || []) colIds[name] = (await L.createCol(String(name))).id;
  let added = 0, skipped = 0;
  for (const it of m.items) {
    const data = files[it.file];
    if (!data || typeof it.name !== "string") { skipped++; continue; }
    if (L.state.items.some((x) => x.fp === it.fp)) { skipped++; continue; }
    const blob = new Blob([data], { type: MIME[it.fmt] || "application/octet-stream" });
    const rec = { name: it.name, fmt: it.fmt, cat: it.cat, size: blob.size, added: +it.added || Date.now(), opened: +it.opened || 0, fav: it.fav ? 1 : 0, tags: (it.tags || []).map(String), cols: (it.cols || []).map((n) => colIds[n]).filter(Boolean), trashed: +it.trashed || 0, fp: it.fp, warn: it.warn || "", view: it.view && typeof it.view === "object" ? it.view : {}, blob, thumb: await L.makeThumb(new File([blob], it.name), it.fmt) };
    await L.insert(rec); added++;
  }
  L.emit();
  return { added, skipped };
}
