// Video and audio: native playback, speed, repeat, subtitles, frame capture, waveform, auto-advance, media keys.
import { h, toast } from "../util.js";
import { t, msg } from "../i18n.js";
import { settings } from "../settings.js";
import { msgBox } from "../viewer.js";
import * as L from "../library.js";
import * as S from "../subs.js";
import { SubOverlay } from "../subs-overlay.js";
import { ask } from "../dialogs.js";

async function waveform(blob, canvas, ctx) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  const ac = new AC();
  try {
    const buf = await ac.decodeAudioData(await blob.arrayBuffer());
    const data = buf.getChannelData(0), n = 600, step = Math.floor(data.length / n) || 1, peaks = [];
    for (let i = 0; i < n; i++) { let m = 0; for (let j = 0; j < step; j += Math.ceil(step / 40)) m = Math.max(m, Math.abs(data[i * step + j] || 0)); peaks.push(m); }
    return peaks;
  } finally { ac.close?.(); }
}

export async function mount(rec, body, ctx) {
  body.textContent = "";
  const isVideo = rec.cat === "vid", el = h(isVideo ? "video" : "audio", { controls: true, src: ctx.obj(rec.blob), preload: "metadata", class: isVideo ? "med" : "" });
  let broken = false;
  el.onerror = () => { broken = true; msgBox(body, t("The browser cannot play this file (unsupported codec or damaged file).") + (isVideo ? " " + t("Converting it to MP4 (H.264) or WebM usually fixes this.") : "")); };
  ctx.cleanup(() => { el.pause(); el.removeAttribute("src"); el.load(); if ("mediaSession" in navigator) navigator.mediaSession.metadata = null; });

  const speed = h("select", { "aria-label": t("Playback speed"), onchange: () => { el.playbackRate = +speed.value; } }, [0.5, 0.75, 1, 1.25, 1.5, 2].map((v) => h("option", { value: v, selected: v === 1 }, v + "×")));
  const rep = h("button", { "aria-pressed": "false", onclick: () => { el.loop = !el.loop; rep.setAttribute("aria-pressed", String(el.loop)); rep.classList.toggle("on", el.loop); } }, "⟲ " + t("Repeat"));
  const tools = [speed, rep];
  if (isVideo) {
    // subtitles: drawn over the video with their own styles (SRT, WebVTT and ASS/SSA), chosen from the library or imported
    const wrap = h("div", { class: "vwrap" }, el), ov = new SubOverlay(wrap, el); let subRec = null, raf = 0;
    el.setAttribute("controlslist", "nofullscreen");
    const tick = () => { raf = 0; ov.update(el.currentTime * 1000); if (!el.paused) raf = requestAnimationFrame(tick); };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    for (const n of ["play", "seeked", "timeupdate", "loadeddata"]) el.addEventListener(n, kick);
    new ResizeObserver(() => ov.refresh(el.currentTime * 1000)).observe(wrap); ctx.cleanup(() => { cancelAnimationFrame(raf); ov.destroy(); });
    const ccB = h("button", { "aria-pressed": "false", onclick: () => chooseSub() }, "CC " + t("Subtitles")), editB = h("button", { hidden: true, onclick: () => subRec && ctx.open(subRec.id, undefined, { video: rec }) }, "✎ " + t("Edit subtitles"));
    const file = h("input", { type: "file", accept: ".srt,.vtt,.ass,.ssa", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      const r = await L.addBlob(f.name, f); if (r.cat !== "sub") { toast(t("This is not a subtitle file.")); return; } await loadSub(r); toast(t("Added “{name}” to your library", { name: r.name }));
    } });
    function useSub(r) { subRec = r; const d = S.parse(S.decodeBytes(new Uint8Array(r._bytes || [])).text, r.fmt); ov.setDoc(d); ov.refresh(el.currentTime * 1000); ccB.classList.toggle("on", !!r); ccB.setAttribute("aria-pressed", String(!!r)); editB.hidden = !r; }
    async function loadSub(r) { r._bytes = new Uint8Array(await r.blob.arrayBuffer()); useSub(r); delete r._bytes; }
    async function chooseSub() {
      const subs = L.state.items.filter((i) => !i.trashed && i.cat === "sub");
      const v = await ask({ title: t("Subtitles"), select: [{ v: "__none", l: t("None") }, ...subs.map((s) => ({ v: String(s.id), l: s.name })), { v: "__file", l: t("Import a subtitle file…") }], confirm: msg("Use") });
      if (v == null) return; if (v === "__file") { file.click(); return; }
      if (v === "__none") { subRec = null; ov.setDoc(null); ov.refresh(0); ccB.classList.remove("on"); ccB.setAttribute("aria-pressed", "false"); editB.hidden = true; return; }
      const r = L.byId(+v); if (r) loadSub(r);
    }
    const base = (n) => n.replace(/\.[^.]+$/, "").toLowerCase(), match = L.state.items.find((i) => !i.trashed && i.cat === "sub" && base(i.name) === base(rec.name));
    if (match) loadSub(match); // same file name as the video: turn the subtitles on, like a desktop player
    const fsB = h("button", { class: "ic", title: t("Full screen"), "aria-label": t("Full screen"), onclick: () => wrap.requestFullscreen?.() }, "⛶");
    tools.push(ccB, editB, file, fsB, h("button", { onclick: () => {
      const c = document.createElement("canvas"); c.width = el.videoWidth; c.height = el.videoHeight;
      if (!c.width) return; c.getContext("2d").drawImage(el, 0, 0);
      c.toBlob((b) => b && ctx.save(rec.name.replace(/\.[^.]+$/, "") + "-" + Math.floor(el.currentTime) + "s.png", b), "image/png");
    } }, "▣ " + t("Capture frame")));
    body.append(h("div", { style: "flex:1;display:flex;flex-direction:column;min-width:0" }, wrap, h("div", { class: "vb c" }, tools)));
  } else {
    const cv = h("canvas", { width: 1200, height: 192, "aria-label": t("Waveform: click to seek") });
    const box = h("div", { class: "aud" }, h("h2", { style: "margin:0;word-break:break-word" }, rec.name), cv, el, h("div", { class: "row" }, tools), h("small", { style: "color:var(--mut)", id: "wmsg" }, ""));
    body.append(box);
    let peaks = null;
    const draw = () => {
      const g = cv.getContext("2d"), w = cv.width, hh = cv.height, bg = getComputedStyle(document.documentElement).getPropertyValue("--mut") || "#888", br = getComputedStyle(document.documentElement).getPropertyValue("--br") || "#4b3df0";
      g.clearRect(0, 0, w, hh);
      if (!peaks) return;
      const frac = el.duration ? el.currentTime / el.duration : 0;
      peaks.forEach((p, i) => { g.fillStyle = i / peaks.length <= frac ? br : bg; const bh = Math.max(3, p * hh * 0.95); g.fillRect((i * w) / peaks.length, (hh - bh) / 2, Math.max(1, w / peaks.length - 1), bh); });
    };
    el.addEventListener("timeupdate", draw);
    cv.onclick = (e) => { if (el.duration) el.currentTime = (e.offsetX / cv.clientWidth) * el.duration; };
    const msg = box.querySelector("#wmsg");
    if (rec.size > settings.waveMb * 1048576) msg.textContent = t("Waveform skipped for large files (over {mb} MB).", { mb: settings.waveMb });
    else waveform(rec.blob, cv, ctx).then((p) => { if (ctx.alive()) { peaks = p; draw(); } }).catch(() => { msg.textContent = t("Waveform unavailable for this file."); });
  }
  el.addEventListener("ended", () => { if (settings.autoNext && !el.loop && ctx.hasNext()) ctx.next(); });
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: rec.name });
      navigator.mediaSession.setActionHandler("previoustrack", () => ctx.prev());
      navigator.mediaSession.setActionHandler("nexttrack", () => ctx.next());
    } catch { /* media keys are optional */ }
  }
  void broken;
}
