// Word (.docx) and Excel (.xlsx) readers. DOCX can be edited as a simplified rich document and exported as HTML / PDF (print).
import { h, lib } from "../util.js";
import { t } from "../i18n.js";
import { loadingBox, msgBox } from "../viewer.js";

export async function mount(rec, body, ctx) {
  return rec.fmt === "xlsx" ? xlsx(rec, body, ctx) : docx(rec, body, ctx);
}

async function docx(rec, body, ctx) {
  loadingBox(body, t("Reading document…"), 0.2);
  const [mammoth, purify] = await Promise.all([lib("mammoth"), lib("purify")]);
  const buf = await rec.blob.arrayBuffer();
  loadingBox(body, t("Converting document…"), 0.6);
  const out = await mammoth.convertToHtml({ arrayBuffer: buf });
  if (!ctx.alive()) return;
  const page = h("div", { class: "page" }); page.innerHTML = purify.sanitize(out.value);
  const exec = (c, v) => { page.focus(); document.execCommand(c, false, v); };
  const btn = (label, fn, title) => h("button", { class: "ic", title, "aria-label": title || label, onmousedown: (e) => e.preventDefault(), onclick: fn }, label);
  const fmtBar = h("div", { class: "vb", hidden: true, style: "justify-content:center" },
    btn("B", () => exec("bold"), t("Bold")), btn("I", () => exec("italic"), t("Italic")), btn("U", () => exec("underline"), t("Underline")),
    btn("H1", () => exec("formatBlock", "H1"), t("Heading 1")), btn("H2", () => exec("formatBlock", "H2"), t("Heading 2")), btn("¶", () => exec("formatBlock", "P"), t("Paragraph")),
    btn("• ", () => exec("insertUnorderedList"), t("Bulleted list")), btn("1.", () => exec("insertOrderedList"), t("Numbered list")), btn("↶", () => exec("undo"), t("Undo")), btn("↷", () => exec("redo"), t("Redo")));
  const edit = h("button", { "aria-pressed": "false", onclick: () => { const on = page.contentEditable !== "true"; page.contentEditable = on ? "true" : "false"; fmtBar.hidden = !on; edit.setAttribute("aria-pressed", String(on)); edit.classList.toggle("on", on); if (on) page.focus(); } }, "✎ " + t("Edit"));
  const clean = () => purify.sanitize(page.innerHTML);
  const htmlDoc = () => new Blob([`<!doctype html><html><head><meta charset="utf-8"><title>${rec.name.replace(/[<>&]/g, "")}</title></head><body>${clean()}</body></html>`], { type: "text/html" });
  const base = rec.name.replace(/\.[^.]+$/, "");
  const tools = h("div", { class: "vb", style: "justify-content:flex-start" }, edit,
    h("button", { onclick: () => ctx.save(base + ".html", htmlDoc()) }, t("Export HTML")),
    h("button", { onclick: () => ctx.addCopy(base + ".html", htmlDoc()) }, t("Save copy to library")),
    h("button", { onclick: () => { const p = h("div", { id: "print" }); p.innerHTML = clean(); document.body.append(p); window.print(); setTimeout(() => p.remove(), 500); } }, t("Print / PDF")),
    h("small", { style: "color:var(--mut)" }, out.messages.length ? t("Some formatting could not be converted.") + " " : "", t("Edits are not written back to the .docx; export or save a copy.")));
  body.textContent = ""; body.style.flexDirection = "column";
  body.append(tools, fmtBar, h("div", { style: "flex:1;min-height:0;overflow:auto;display:flex;justify-content:center;background:var(--pn2)" }, page));
}

async function xlsx(rec, body, ctx) {
  loadingBox(body, t("Reading spreadsheet…"), null);
  const X = await lib("xlsx");
  const wb = X.read(await rec.blob.arrayBuffer(), { type: "array", cellDates: true });
  if (!ctx.alive()) return;
  if (!wb.SheetNames.length) return msgBox(body, t("This workbook has no sheets."));
  const holder = h("div", { style: "flex:1;min-width:0;overflow:auto" }), tabs = h("div", { class: "vb", style: "justify-content:flex-start" });
  const show = (name) => {
    tabs.textContent = "";
    wb.SheetNames.forEach((s) => tabs.append(h("button", { class: s === name ? "on" : "", onclick: () => show(s) }, s)));
    tabs.append(h("button", { style: "margin-left:auto", onclick: () => ctx.save(rec.name.replace(/\.[^.]+$/, "") + "-" + name + ".csv", new Blob([X.utils.sheet_to_csv(wb.Sheets[name])], { type: "text/csv" })) }, t("Export sheet as CSV")));
    const rows = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }), tb = h("table");
    rows.slice(0, 1000).forEach((r, i) => tb.append(h("tr", {}, r.map((c) => h(i ? "td" : "th", {}, String(c))))));
    holder.textContent = ""; holder.append(h("div", { class: "tbl" }, tb, rows.length > 1000 ? h("p", { class: "fine" }, t("Showing the first {n} rows", { n: 1000 })) : null));
  };
  body.textContent = ""; body.style.flexDirection = "column"; body.append(tabs, holder); show(wb.SheetNames[0]);
}
