// Video and audio: native playback, speed, repeat, subtitles, frame capture, waveform, auto-advance, media keys.
import { h } from "../util.js";
import { t } from "../i18n.js";
import { settings } from "../settings.js";
import { msgBox } from "../viewer.js";

const srtToVtt = (s) => "WEBVTT\n\n" + s.replace(/\r/g, "").replace(/(\d+:\d+:\d+),(\d+)/g, "$1.$2");

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
    const file = h("input", { type: "file", accept: ".vtt,.srt", hidden: true, onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return; let txt = await f.text(); if (!txt.startsWith("WEBVTT")) txt = srtToVtt(txt);
      el.append(h("track", { kind: "subtitles", label: f.name, default: true, src: ctx.obj(new Blob([txt], { type: "text/vtt" })) }));
      if (el.textTracks[el.textTracks.length - 1]) el.textTracks[el.textTracks.length - 1].mode = "showing";
    } });
    tools.push(h("button", { onclick: () => file.click() }, "CC " + t("Subtitles")), file, h("button", { onclick: () => {
      const c = document.createElement("canvas"); c.width = el.videoWidth; c.height = el.videoHeight;
      if (!c.width) return; c.getContext("2d").drawImage(el, 0, 0);
      c.toBlob((b) => b && ctx.save(rec.name.replace(/\.[^.]+$/, "") + "-" + Math.floor(el.currentTime) + "s.png", b), "image/png");
    } }, "▣ " + t("Capture frame")));
    body.append(h("div", { style: "flex:1;display:flex;flex-direction:column;min-width:0" }, h("div", { style: "flex:1;min-height:0;display:flex" }, el), h("div", { class: "vb", style: "justify-content:center" }, tools)));
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
