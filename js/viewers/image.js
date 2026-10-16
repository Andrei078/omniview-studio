// Image viewer with zoom/pan and a non-destructive editor (brightness, contrast, saturation, rotate, flip, export).
import { h, toast } from "../util.js";
import { t } from "../i18n.js";
import { msgBox } from "../viewer.js";

const FMT = [["image/png", "PNG", "png"], ["image/jpeg", "JPEG", "jpg"], ["image/webp", "WebP", "webp"]];

/** Fallback for browsers whose canvas has no `filter` support. */
function manualAdjust(c, S) {
  const g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height), p = d.data, b = S.b / 100, k = S.c / 100, s = S.s / 100;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] * b, gr = p[i + 1] * b, bl = p[i + 2] * b;
    r = (r - 128) * k + 128; gr = (gr - 128) * k + 128; bl = (bl - 128) * k + 128;
    const l = 0.299 * r + 0.587 * gr + 0.114 * bl;
    p[i] = Math.max(0, Math.min(255, l + (r - l) * s)); p[i + 1] = Math.max(0, Math.min(255, l + (gr - l) * s)); p[i + 2] = Math.max(0, Math.min(255, l + (bl - l) * s));
  }
  g.putImageData(d, 0, 0);
}

export async function mount(rec, body, ctx) {
  body.textContent = "";
  const img = h("img", { src: ctx.obj(rec.blob), alt: rec.name, draggable: false }), stage = h("div", { class: "stage" }, img);
  let z = 1, x = 0, y = 0, drag = null;
  const S = { b: 100, c: 100, s: 100, rot: 0, fx: 1, fy: 1 };
  let hist = [{ ...S }], hi = 0;
  const paint = () => {
    img.style.transform = `translate(${x}px,${y}px) rotate(${S.rot}deg) scale(${z * S.fx},${z * S.fy})`;
    img.style.filter = `brightness(${S.b}%) contrast(${S.c}%) saturate(${S.s}%)`;
  };
  const zoom = (k) => { z = Math.min(12, Math.max(0.1, z * k)); paint(); };
  const reset = () => { z = 1; x = y = 0; paint(); };
  stage.onwheel = (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); };
  stage.onpointerdown = (e) => { drag = { x: e.clientX - x, y: e.clientY - y }; stage.setPointerCapture?.(e.pointerId); stage.style.cursor = "grabbing"; };
  stage.onpointermove = (e) => { if (drag) { x = e.clientX - drag.x; y = e.clientY - drag.y; paint(); } };
  stage.onpointerup = () => { drag = null; stage.style.cursor = ""; };
  stage.ondblclick = reset;
  let failed = false;
  img.onerror = () => { failed = true; msgBox(body, t("The browser cannot display this image (unsupported codec or damaged file).")); };

  // editor panel
  const sliders = {};
  const range = (key, label) => { const out = h("span", {}, "100%"); const i = h("input", { type: "range", min: 0, max: 200, value: 100, "aria-label": label, oninput: () => { S[key] = +i.value; out.textContent = i.value + "%"; paint(); }, onchange: () => commit() }); sliders[key] = [i, out]; return h("label", {}, h("span", { class: "fld", style: "gap:4px" }, label, out), i); };
  const sync = () => { for (const k in sliders) { sliders[k][0].value = S[k]; sliders[k][1].textContent = S[k] + "%"; } undoB.disabled = hi === 0; redoB.disabled = hi === hist.length - 1; paint(); };
  const commit = () => { hist = hist.slice(0, hi + 1); hist.push({ ...S }); hi++; sync(); };
  const jump = (n) => { hi = n; Object.assign(S, hist[hi]); sync(); };
  const undoB = h("button", { onclick: () => hi > 0 && jump(hi - 1) }, "↶ " + t("Undo")), redoB = h("button", { onclick: () => hi < hist.length - 1 && jump(hi + 1) }, t("Redo") + " ↷");
  const fmt = h("select", { "aria-label": t("Format") }, FMT.map(([m, l]) => h("option", { value: m }, l)));
  const q = h("input", { type: "range", min: 30, max: 100, value: 90, "aria-label": t("Quality") }), qo = h("span", {}, "90%"); q.oninput = () => { qo.textContent = q.value + "%"; };
  const size = h("select", { "aria-label": t("Size") }, [100, 75, 50, 25].map((p) => h("option", { value: p }, p + "%")));

  async function render() {
    const sw = img.naturalWidth || 1024, sh = img.naturalHeight || 768, k = +size.value / 100, swap = S.rot % 180 !== 0;
    const W = Math.max(1, Math.round((swap ? sh : sw) * k)), H = Math.max(1, Math.round((swap ? sw : sh) * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), type = fmt.value;
    if (type === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, W, H); }
    g.translate(W / 2, H / 2); g.rotate((S.rot * Math.PI) / 180); g.scale(S.fx * k, S.fy * k);
    const native = "filter" in g;
    if (native) g.filter = `brightness(${S.b}%) contrast(${S.c}%) saturate(${S.s}%)`;
    g.drawImage(img, -sw / 2, -sh / 2, sw, sh);
    if (!native) { g.setTransform(1, 0, 0, 1, 0, 0); manualAdjust(c, S); }
    const blob = await new Promise((r) => c.toBlob(r, type, +q.value / 100));
    if (!blob) throw new Error(t("The browser could not encode this format."));
    const ext = FMT.find((f) => f[0] === blob.type)?.[2] || "png";
    return { blob, name: rec.name.replace(/\.[^.]+$/, "") + "-edited." + ext };
  }
  const guard = (fn) => async () => { try { await fn(); } catch (e) { toast(String(e.message || e)); } };
  const panel = h("aside", { class: "edit", hidden: true, "aria-label": t("Edit image") },
    range("b", t("Brightness")), range("c", t("Contrast")), range("s", t("Saturation")),
    h("div", { class: "row" }, h("button", { onclick: () => { S.rot = (S.rot + 270) % 360; commit(); }, "aria-label": t("Rotate left"), title: t("Rotate left") }, "↺"), h("button", { onclick: () => { S.rot = (S.rot + 90) % 360; commit(); }, "aria-label": t("Rotate right"), title: t("Rotate right") }, "↻"), h("button", { onclick: () => { S.fx *= -1; commit(); }, title: t("Flip horizontally") }, "⇋"), h("button", { onclick: () => { S.fy *= -1; commit(); }, title: t("Flip vertically") }, "⇅")),
    h("div", { class: "row" }, undoB, redoB), h("button", { onclick: () => { Object.assign(S, { b: 100, c: 100, s: 100, rot: 0, fx: 1, fy: 1 }); commit(); } }, t("Reset")),
    h("hr", { style: "width:100%;border:0;border-top:1px solid var(--ln)" }),
    h("label", {}, t("Format"), fmt), h("label", {}, h("span", { class: "fld", style: "gap:4px" }, t("Quality"), qo), q), h("label", {}, t("Size"), size),
    h("button", { class: "pri", onclick: guard(async () => { const r = await render(); ctx.save(r.name, r.blob); }) }, t("Download edited image")),
    h("button", { onclick: guard(async () => { const r = await render(); await ctx.addCopy(r.name, r.blob); }) }, t("Save copy to library")),
    h("small", { style: "color:var(--mut)" }, t("Your original is never changed.")));
  const toggle = h("button", { "aria-pressed": "false", onclick: () => { panel.hidden = !panel.hidden; toggle.setAttribute("aria-pressed", String(!panel.hidden)); toggle.classList.toggle("on", !panel.hidden); } }, "✎ " + t("Edit"));
  stage.append(h("div", { class: "fl" }, h("button", { class: "ic", "aria-label": t("Zoom out"), onclick: () => zoom(1 / 1.25) }, "−"), h("button", { onclick: reset }, "1:1"), h("button", { class: "ic", "aria-label": t("Zoom in"), onclick: () => zoom(1.25) }, "+"), toggle));
  body.append(stage, panel); sync();
  if (failed) return;
}
