// Draws the subtitle lines that are active at a given time over a video box (approximation of ASS rendering:
// alignment, margins, \pos, font/size/colors, bold/italic/underline/strike, outline and shadow). Uses textContent only.
import { segments, assColorToCss } from "./subs.js";

const css = (c, d) => assColorToCss(c) || d;
/** Rectangle of the picture inside a <video> element (object-fit: contain leaves bars). */
export function frameRect(video) {
  const cw = video.clientWidth, ch = video.clientHeight, vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh || !cw || !ch) return { left: 0, top: 0, width: cw, height: ch };
  const ar = vw / vh;
  return cw / ch > ar ? { width: ch * ar, height: ch, left: (cw - ch * ar) / 2, top: 0 } : { width: cw, height: cw / ar, left: 0, top: (ch - cw / ar) / 2 };
}

export class SubOverlay {
  constructor(box, video) { this.video = video; this.doc = null; this.key = ""; this.el = document.createElement("div"); this.el.className = "subov"; box.append(this.el); }
  setDoc(doc) { this.doc = doc; this.key = ""; }
  destroy() { this.el.remove(); }
  /** Re-render now (after the document changed). */
  refresh(ms) { this.key = ""; this.update(ms); }
  update(ms) {
    const doc = this.doc, r = this.video ? frameRect(this.video) : { left: 0, top: 0, width: this.el.parentElement.clientWidth, height: this.el.parentElement.clientHeight };
    const active = doc ? doc.events.filter((e) => !e.comment && e.start <= ms && ms < e.end).sort((a, b) => a.layer - b.layer || a.start - b.start) : [];
    const key = active.map((e) => e.id + ":" + e.text.length).join(",") + "|" + Math.round(r.width) + "x" + Math.round(r.height) + "|" + doc?.styles.length;
    if (key === this.key) return; this.key = key;
    this.el.replaceChildren(); if (!active.length || !r.width) return;
    Object.assign(this.el.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    const sy = r.height / (+doc.info.PlayResY || 288), sx = r.width / (+doc.info.PlayResX || 384), buckets = {};
    for (const ev of active) {
      const st = doc.styles.find((s) => s.name === ev.style) || doc.styles[0], { runs, meta } = segments(ev.text), an = meta.an || st.alignment || 2;
      const line = document.createElement("div"); line.className = "subl"; line.style.textAlign = an % 3 === 1 ? "left" : an % 3 === 2 ? "center" : "right";
      const o = Math.max(0, st.outlineW * sy), sh = Math.max(0, st.shadow * sy), oc = css(st.outline, "#000"), sc = "#0009";
      const dirs = o ? [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, -o], [o, -o], [-o, o]].map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${oc}`) : [];
      const shadow = [...dirs, ...(sh ? [`${sh.toFixed(1)}px ${sh.toFixed(1)}px ${(sh / 2).toFixed(1)}px ${sc}`] : [])].join(",");
      for (const run of runs) {
        if (run.nl) { line.append(document.createElement("br")); continue; }
        const sp = document.createElement("span"); sp.textContent = run.t;
        Object.assign(sp.style, { fontSize: (run.fs || st.size) * sy + "px", fontFamily: `"${run.fn || st.font}", Arial, sans-serif`, color: run.c || css(st.primary, "#fff"), fontWeight: run.b || st.bold ? "700" : "400", fontStyle: run.i || st.italic ? "italic" : "normal", textDecoration: [run.u || st.underline ? "underline" : "", run.s || st.strike ? "line-through" : ""].join(" ").trim() || "none", textShadow: run.oc ? shadow.split(oc).join(run.oc) : shadow, letterSpacing: st.spacing * sx + "px" });
        line.append(sp);
      }
      const ml = (ev.marginL || st.marginL) * sx, mr = (ev.marginR || st.marginR) * sx, mv = (ev.marginV || st.marginV) * sy;
      if (meta.pos) {
        Object.assign(line.style, { position: "absolute", left: meta.pos[0] * sx + "px", top: meta.pos[1] * sy + "px", transform: `translate(${an % 3 === 1 ? "0" : an % 3 === 2 ? "-50%" : "-100%"},${an > 6 ? "0" : an > 3 ? "-50%" : "-100%"})` });
        this.el.append(line); continue;
      }
      const b = (buckets[an] ??= (() => {
        const d = document.createElement("div"); d.className = "subb";
        Object.assign(d.style, { left: ml + "px", right: mr + "px", justifyContent: an > 6 ? "flex-start" : an > 3 ? "center" : "flex-end", ...(an > 6 ? { top: mv + "px" } : an > 3 ? { top: "0", bottom: "0" } : { bottom: mv + "px" }) });
        this.el.append(d); return d;
      })());
      b.append(line);
    }
  }
}
