// PDF reader (PDF.js, self-hosted): lazy page rendering with memory release, zoom/fit/rotate, thumbnails, text search, resume.
import { h, lib, vendorUrl, bar } from "../util.js";
import { t } from "../i18n.js";
import { loadingBox, msgBox } from "../viewer.js";

export async function mount(rec, body, ctx) {
  const pdfjs = await lib("pdf");
  pdfjs.GlobalWorkerOptions.workerSrc = vendorUrl("pdf.worker.min.js");
  loadingBox(body, t("Opening…"), 0);
  const data = new Uint8Array(await rec.blob.arrayBuffer());
  const task = pdfjs.getDocument({ data, isEvalSupported: false, enableXfa: false });
  task.onProgress = ({ loaded, total }) => { if (total && ctx.alive()) loadingBox(body, t("Opening…"), loaded / total); };
  let doc;
  try { doc = await task.promise; } catch (e) {
    return msgBox(body, e?.name === "PasswordException" ? t("This PDF is password-protected. Entering passwords is not supported.") : t("This file is not a valid PDF or is damaged."));
  }
  if (!ctx.alive()) { doc.destroy(); return; }
  ctx.cleanup(() => { doc.destroy(); });
  const N = doc.numPages, dpr = Math.min(devicePixelRatio || 1, 2), view = rec.view || (rec.view = {});
  let scale = view.scale || 0, rot = view.rot || 0, page = Math.min(Math.max(view.page || 1, 1), N), base = null, fit = scale ? "custom" : "width";
  const first = await doc.getPage(1); base = first.getViewport({ scale: 1, rotation: 0 });

  const pages = h("div", { class: "pdf", tabindex: 0, "aria-label": rec.name });
  const info = h("input", { type: "number", min: 1, max: N, value: page, "aria-label": t("Page number"), style: "width:70px", onchange: () => goto(+info.value) });
  const tot = h("span", {}, "/ " + N);
  const sw = (n) => Math.max(1, n);
  const dims = (rotation) => (rotation % 180 ? [base.height, base.width] : [base.width, base.height]);
  const applyFit = () => {
    const [w, hh] = dims(rot), aw = pages.clientWidth - 36 || 700, ah = pages.clientHeight - 36 || 900;
    if (fit === "width") scale = aw / w; else if (fit === "page") scale = Math.min(aw / w, ah / hh);
    scale = Math.min(5, Math.max(0.2, scale));
  };
  const tasks = new WeakMap();
  const render = async (c, n) => {
    const key = scale + ":" + rot; if (c.dataset.k === key) return; c.dataset.k = key;
    tasks.get(c)?.cancel();
    const pg = await doc.getPage(n), vp = pg.getViewport({ scale: scale * dpr, rotation: rot });
    c.width = vp.width; c.height = vp.height; c.style.width = vp.width / dpr + "px"; c.style.height = vp.height / dpr + "px";
    const rt = pg.render({ canvasContext: c.getContext("2d"), viewport: vp }); tasks.set(c, rt);
    try { await rt.promise; } catch { delete c.dataset.k; }
  };
  const release = (c) => { tasks.get(c)?.cancel(); delete c.dataset.k; c.width = 1; c.height = 1; };
  const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? render(e.target, +e.target.dataset.n) : release(e.target))), { root: pages, rootMargin: "900px 0px" });
  ctx.cleanup(() => io.disconnect());

  function build(keep = page) {
    applyFit(); io.disconnect(); pages.textContent = "";
    const [w, hh] = dims(rot);
    for (let n = 1; n <= N; n++) { const c = h("canvas", { "data-n": n, role: "img", "aria-label": t("Page {n}", { n }) }); c.width = 1; c.height = 1; c.style.width = sw(w * scale) + "px"; c.style.height = sw(hh * scale) + "px"; pages.append(c); io.observe(c); }
    goto(keep, false);
  }
  function goto(n, smooth = true) {
    n = Math.min(N, Math.max(1, Math.round(n) || 1)); page = n; info.value = n;
    pages.children[n - 1]?.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    mark();
  }
  let raf = 0;
  pages.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => {
    const top = pages.scrollTop + pages.clientHeight / 3; let lo = 0, hi = N - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (pages.children[mid].offsetTop - pages.offsetTop <= top) lo = mid; else hi = mid - 1; }
    page = lo + 1; info.value = page; mark();
  }); });
  ctx.cleanup(() => { cancelAnimationFrame(raf); view.page = page; view.scale = fit === "custom" ? scale : 0; view.rot = rot; ctx.saveView(); });
  let pinch0 = 0;
  const tdist = (e) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  pages.addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinch0 = tdist(e); }, { passive: true });
  pages.addEventListener("touchmove", (e) => { if (e.touches.length === 2 && pinch0) { const k = tdist(e) / pinch0; pages.style.transformOrigin = "50% 0"; pages.style.transform = `scale(${Math.min(3, Math.max(.4, k))})`; pages.dataset.k = k; } }, { passive: true });
  const endPinch = () => { if (!pinch0) return; const k = +pages.dataset.k || 1; pinch0 = 0; pages.style.transform = ""; pages.dataset.k = ""; if (Math.abs(k - 1) > 0.05) zoomBy(k); };
  pages.addEventListener("touchend", (e) => { if (e.touches.length < 2) endPinch(); }, { passive: true });
  pages.addEventListener("touchcancel", () => { pinch0 = 0; pages.style.transform = ""; }, { passive: true });
  const zoomBy = (k) => { fit = "custom"; scale = Math.min(5, Math.max(0.2, scale * k)); build(page); };

  // thumbnails
  const side = h("div", { class: "vside", hidden: true }), thumbs = [];
  const tio = new IntersectionObserver((es) => es.forEach(async (e) => { if (!e.isIntersecting || e.target.dataset.done) return; e.target.dataset.done = 1; const pg = await doc.getPage(+e.target.dataset.n), vp0 = pg.getViewport({ scale: 1 }), vp = pg.getViewport({ scale: 120 / vp0.width }); e.target.width = vp.width; e.target.height = vp.height; pg.render({ canvasContext: e.target.getContext("2d"), viewport: vp }); }), { root: side });
  ctx.cleanup(() => tio.disconnect());
  const buildThumbs = () => { side.textContent = ""; thumbs.length = 0; for (let n = 1; n <= N; n++) { const c = h("canvas", { "data-n": n, role: "button", tabindex: 0, "aria-label": t("Page {n}", { n }), width: 120, height: 160, onclick: () => goto(n), onkeydown: (e) => { if (e.key === "Enter") goto(n); } }); thumbs.push(c); side.append(c); tio.observe(c); } };
  const mark = () => thumbs.forEach((c, i) => c.classList.toggle("cur", i + 1 === page));

  // search (page-level results)
  let hits = [], hit = -1, searchId = 0;
  const q = h("input", { type: "search", placeholder: t("Find in document"), "aria-label": t("Find in document"), style: "width:170px" }), res = h("span", { style: "color:var(--mut);font-size:.85rem" }, "");
  async function search() {
    const term = q.value.trim().toLowerCase(), mine = ++searchId; hits = []; hit = -1; res.textContent = "";
    if (!term) return;
    for (let n = 1; n <= N; n++) {
      if (mine !== searchId || !ctx.alive()) return;
      bar(n / N);
      const tc = await (await doc.getPage(n)).getTextContent(), s = tc.items.map((i) => i.str).join(" ").toLowerCase();
      let c = 0, at = -1; while ((at = s.indexOf(term, at + 1)) >= 0) c++;
      if (c) hits.push({ n, c });
    }
    bar(null);
    res.textContent = hits.length ? t("{n} match(es) on {p} page(s)", { n: hits.reduce((a, x) => a + x.c, 0), p: hits.length }) : t("No matches");
    if (hits.length) step(1);
  }
  const step = (d) => { if (!hits.length) return; hit = (hit + d + hits.length) % hits.length; goto(hits[hit].n); };
  q.onkeydown = (e) => { if (e.key !== "Enter") return; if (e.shiftKey) step(-1); else if (hits.length && q.dataset.last === q.value) step(1); else { q.dataset.last = q.value; search(); } };
  ctx.cleanup(() => { searchId++; bar(null); });

  const tb = h("div", { class: "vb c" },
    h("button", { class: "ic", "aria-pressed": "false", title: t("Thumbnails"), "aria-label": t("Thumbnails"), onclick: (e) => { side.hidden = !side.hidden; e.currentTarget.setAttribute("aria-pressed", String(!side.hidden)); if (!thumbs.length) { buildThumbs(); mark(); } } }, "▤"),
    h("button", { class: "ic", "aria-label": t("Previous page"), onclick: () => goto(page - 1) }, "‹"), info, tot, h("button", { class: "ic", "aria-label": t("Next page"), onclick: () => goto(page + 1) }, "›"),
    h("button", { class: "ic", "aria-label": t("Zoom out"), onclick: () => zoomBy(1 / 1.2) }, "−"), h("button", { class: "ic", "aria-label": t("Zoom in"), onclick: () => zoomBy(1.2) }, "+"),
    h("button", { onclick: () => { fit = "width"; build(page); } }, t("Fit width")), h("button", { onclick: () => { fit = "page"; build(page); } }, t("Fit page")),
    h("button", { class: "ic", "aria-label": t("Rotate"), title: t("Rotate view (not saved to the file)"), onclick: () => { rot = (rot + 90) % 360; build(page); } }, "↻"),
    q, h("button", { class: "ic", "aria-label": t("Previous match"), onclick: () => step(-1) }, "↑"), h("button", { class: "ic", "aria-label": t("Next match"), onclick: () => step(1) }, "↓"), res);
  body.textContent = ""; body.style.flexDirection = "column";
  body.append(tb, h("div", { style: "flex:1;min-height:0;display:flex" }, side, h("div", { class: "pdfwrap", style: "min-height:0" }, pages)));
  build(page);
  let rz, firstRO = true; const ro = new ResizeObserver(() => { if (firstRO) { firstRO = false; return; } clearTimeout(rz); rz = setTimeout(() => { if (fit !== "custom" && ctx.alive()) build(page); }, 150); });
  ro.observe(pages); ctx.cleanup(() => { ro.disconnect(); clearTimeout(rz); });
}
