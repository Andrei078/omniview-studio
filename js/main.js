// Application bootstrap: settings, database, wiring, drag & drop, shortcuts, offline updates.
import { $, h, toast, bar, download, debounce } from "./util.js";
import * as db from "./db.js";
import * as L from "./library.js";
import { settings, loadSettings, update, inHalloweenSeason } from "./settings.js";
import { t, applyI18n, onLang } from "./i18n.js";
import { render, importUI, setAndScroll, closeCtx } from "./views.js";
import { isOpen, requestClose, step } from "./viewer.js";
import { openSettings, onboarding } from "./dialogs.js";
import { exportBackup, importBackup } from "./backup.js";

async function walk(entry, out) {
  if (entry.isFile) out.push(await new Promise((ok, no) => entry.file(ok, no)));
  else if (entry.isDirectory) {
    const rd = entry.createReader();
    for (;;) { const batch = await new Promise((ok) => rd.readEntries(ok, () => ok([]))); if (!batch.length) break; for (const e of batch) await walk(e, out); }
  }
}
async function droppedFiles(dt) {
  const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean), out = [];
  if (entries.length) for (const e of entries) await walk(e, out); else out.push(...dt.files);
  return out;
}

const hooks = {
  async backup() {
    bar(-1);
    try { const blob = await exportBackup((p) => bar(p)); download(`omniview-backup-${new Date().toISOString().slice(0, 10)}.zip`, blob); toast(t("Backup created.")); }
    catch (e) { toast(t("Backup failed: {error}", { error: e.message })); } finally { bar(null); }
  },
  async restore(file) {
    bar(-1);
    try { const r = await importBackup(file); toast(t("Restored {n} file(s), skipped {s}.", { n: r.added, s: r.skipped })); }
    catch (e) { toast(e.message); } finally { bar(null); }
  },
};

function wire() {
  $("#btn-import").onclick = () => $("#fi").click();
  $("#btn-settings").onclick = () => openSettings("General", hooks);
  $("#btn-help").onclick = () => openSettings("Shortcuts", hooks);
  for (const id of ["#fi", "#fo"]) $(id).onchange = (e) => { const f = [...e.target.files]; e.target.value = ""; importUI(f); };
  $("#q").oninput = debounce((e) => { L.state.q = e.target.value; if (L.state.q && ["home", "cols"].includes(L.state.section)) setAndScroll("all"); else L.emit(); }, 120);

  let depth = 0;
  addEventListener("dragenter", (e) => { e.preventDefault(); depth++; document.body.classList.add("over"); });
  addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; document.body.classList.remove("over"); } });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", async (e) => { e.preventDefault(); depth = 0; document.body.classList.remove("over"); importUI(await droppedFiles(e.dataTransfer)); });

  addEventListener("keydown", (e) => {
    const a = document.activeElement, typing = /INPUT|TEXTAREA|SELECT/.test(a?.tagName || "") || a?.isContentEditable, mod = e.ctrlKey || e.metaKey, key = e.key.toLowerCase();
    if (document.querySelector(".dlg-b")) return; // dialogs handle their own keys
    if (mod && key === "o") { e.preventDefault(); (e.shiftKey ? $("#fo") : $("#fi")).click(); }
    else if (mod && key === ",") { e.preventDefault(); openSettings("General", hooks); }
    else if (e.key === "Escape") { if (isOpen()) requestClose(); else { closeCtx(); if (L.state.sel.size) { L.state.sel.clear(); L.emit(); } } }
    else if (isOpen() && !typing && (e.key === "ArrowRight" || e.key === "ArrowLeft")) step(e.key === "ArrowRight" ? 1 : -1);
    else if (!typing && !isOpen() && (e.key === "/" || (mod && key === "f"))) { e.preventDefault(); $("#q").focus(); }
    else if (!typing && e.key === "?") openSettings("Shortcuts", hooks);
    else if (!typing && !isOpen() && e.key === "Delete" && L.state.sel.size && L.state.section !== "trash") { const ids = [...L.state.sel]; L.trash(ids).then(() => { L.state.sel.clear(); toast(t("Moved to Trash"), { label: t("Undo"), run: () => L.restore(ids) }); }); }
    else if (!typing && !isOpen() && mod && key === "a") { e.preventDefault(); L.visible().forEach((i) => L.state.sel.add(i.id)); L.emit(); }
  });

  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; $("#btn-install").hidden = false; });
  $("#btn-install").onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; $("#btn-install").hidden = true; };
  onLang(() => { applyI18n(); render(); setTimeout(measureHeader, 0); });
  const hdr = $("header.top");
  if (hdr) { measureHeader(); new ResizeObserver(measureHeader).observe(hdr); addEventListener("resize", measureHeader); }
}
function measureHeader() { const h = $("header.top"); if (h) document.documentElement.style.setProperty("--hdr-h", h.offsetHeight + "px"); }

function registerSW() {
  if (!("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  const had = !!navigator.serviceWorker.controller; let reloaded = false;
  navigator.serviceWorker.register("sw.js").then((reg) => {
    const offer = () => toast(t("A new version is available."), { label: t("Reload"), run: () => reg.waiting?.postMessage("skip") });
    if (reg.waiting && navigator.serviceWorker.controller) offer();
    reg.addEventListener("updatefound", () => { const w = reg.installing; w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(); }); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (had && !reloaded) { reloaded = true; location.reload(); } });
}

export async function start({ indexedDBFactory } = {}) {
  loadSettings(); L.state.mode = settings.view; applyI18n(); wire();
  try { await db.init(indexedDBFactory); await L.load(); }
  catch {
    $("#main").append(h("div", { class: "msg" }, h("h2", {}, t("Storage is not available")), t("Your browser blocks local storage (private browsing?). Open OmniView in a normal window to keep your files.")));
    $("#splash")?.remove(); return;
  }
  let timer; L.onChange(() => { if (isOpen()) return; clearTimeout(timer); timer = setTimeout(render, 0); });
  render();
  const sp = $("#splash"); if (sp) { sp.classList.add("out"); setTimeout(() => sp.remove(), 300); }
  registerSW();
  if (!settings.onboarded) onboarding(() => update({ onboarded: true }));
  else if (inHalloweenSeason() && settings.theme !== "halloween") {
    let asked = false; try { asked = !!localStorage.getItem("ov-hw-asked"); localStorage.setItem("ov-hw-asked", "1"); } catch { /* ignore */ }
    if (!asked) setTimeout(() => toast(t("Halloween is here 🎃 Try the spooky theme?"), { label: t("Try it"), run: () => update({ theme: "halloween" }) }), 2500);
  }
}
if (!globalThis.__OV_TEST__) start();
