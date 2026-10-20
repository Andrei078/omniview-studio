// Text, Markdown, JSON, HTML source and CSV. Editable with draft recovery; Markdown has a sanitized live preview.
import { h, lib, markdown, parseCSV, toast, fmtB, put } from "../util.js";
import { t } from "../i18n.js";

const draftKey = (id) => "ov-draft-" + id;
const getDraft = (id) => { try { return localStorage.getItem(draftKey(id)); } catch { return null; } };
const setDraft = (id, v) => { try { v == null ? localStorage.removeItem(draftKey(id)) : localStorage.setItem(draftKey(id), v); } catch { /* storage may be full */ } };

function table(rows, max = 1000) {
  const tb = h("table");
  rows.slice(0, max).forEach((r, i) => tb.append(h("tr", {}, r.map((c) => h(i ? "td" : "th", {}, String(c))))));
  return h("div", { class: "tbl" }, tb, rows.length > max ? h("p", { class: "fine" }, t("Showing the first {n} rows", { n: max })) : null);
}

export async function mount(rec, body, ctx) {
  body.textContent = "";
  const original = await rec.blob.text();
  if (rec.fmt === "csv") {
    const wrap = h("div", { style: "flex:1;min-width:0;overflow:auto" }, table(parseCSV(original)));
    body.append(wrap); return;
  }
  const area = h("textarea", { class: "txt", spellcheck: false, "aria-label": rec.name, wrap: "soft" });
  area.value = original;
  let saved = original, dirty = false;
  const status = h("span", { style: "color:var(--mut);font-size:.85rem" }, "");
  const saveBtn = h("button", { class: "pri", disabled: true, onclick: () => doSave() }, t("Save changes") + " (Ctrl+S)");
  const bar = h("div", { class: "vb", style: "justify-content:flex-start" }, saveBtn, status);
  const refresh = () => { dirty = area.value !== saved; saveBtn.disabled = !dirty; status.textContent = (dirty ? "● " + t("Unsaved changes") + " · " : "") + area.value.length + " " + t("characters") + " · " + fmtB(new Blob([area.value]).size); };
  async function doSave() {
    rec.blob = new Blob([area.value], { type: rec.blob.type || "text/plain" }); rec.size = rec.blob.size; saved = area.value;
    await ctx.saveView(); setDraft(rec.id, null); refresh(); toast(t("Saved to your library"));
  }
  let timer;
  area.addEventListener("input", () => { refresh(); clearTimeout(timer); timer = setTimeout(() => setDraft(rec.id, dirty ? area.value : null), 600); });
  area.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); if (dirty) doSave(); } });
  ctx.cleanup(() => { clearTimeout(timer); if (dirty) setDraft(rec.id, area.value); });
  if (rec.fmt === "json") bar.append(h("button", { onclick: () => { try { area.value = JSON.stringify(JSON.parse(area.value), null, 2); refresh(); } catch (e) { toast(t("Invalid JSON: {error}", { error: e.message })); } } }, "{ } " + t("Format")));
  if (rec.fmt === "html") bar.append(h("small", { style: "color:var(--mut)" }, t("Shown as source. Scripts are never executed.")));

  const draft = getDraft(rec.id);
  const banner = draft != null && draft !== original ? h("div", { class: "warn", style: "display:flex;gap:10px;align-items:center;flex-wrap:wrap" }, t("An unsaved draft from a previous session was found."),
    h("button", { onclick: () => { area.value = draft; refresh(); banner.remove(); } }, t("Restore draft")), h("button", { onclick: () => { setDraft(rec.id, null); banner.remove(); } }, t("Discard"))) : null;

  let main = area;
  if (rec.fmt === "md") {
    const purify = await lib("purify"), prev = h("div", { class: "md", "aria-label": t("Preview") });
    const paint = () => { prev.innerHTML = purify.sanitize(markdown(area.value)); };
    area.addEventListener("input", paint); paint();
    main = h("div", { class: "split" }, area, prev);
  }
  body.style.flexDirection = "column";
  put(body, bar, banner, h("div", { style: "flex:1;min-height:0;display:flex" }, main)); refresh();
}
