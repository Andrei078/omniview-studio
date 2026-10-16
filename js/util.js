// Small DOM + helper toolkit shared by all modules.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Create an element. `on*` attributes are handlers; false/null attributes are omitted (except aria-*). */
export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || (v === false && !k.startsWith("aria-"))) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e[k] = v;
    else e.setAttribute(k, v === true ? "" : String(v));
  }
  e.append(...kids.flat(Infinity).filter((x) => x != null && x !== false));
  return e;
}

export const fmtB = (n) => (n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB");
export const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

let toastTimer;
/** Toast with an optional action button: toast("Updated", { label: "Reload", run }). */
export function toast(msg, action) {
  const e = $("#toast"); if (!e) return;
  e.textContent = msg;
  if (action) e.append(h("button", { onclick: () => { e.classList.remove("s"); action.run(); } }, action.label));
  e.classList.add("s");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => e.classList.remove("s"), action ? 12000 : 4200);
}

/** Top progress bar: bar(0..1) determinate, bar(-1) indeterminate, bar(null) hidden. */
export function bar(p) {
  const e = $("#bar"); if (!e) return;
  e.classList.toggle("ind", p === -1);
  e.style.width = p == null ? "0" : p === -1 ? "" : Math.round(Math.min(1, Math.max(0, p)) * 100) + "%";
}

/** Download a blob with a normal link (the site is served from its own origin, so this just works). */
export function download(name, blob) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Self-hosted third-party scripts, loaded only when a viewer needs them. */
const LIBS = { pdf: ["pdf.min.js", "pdfjsLib"], mammoth: ["mammoth.browser.min.js", "mammoth"], purify: ["purify.min.js", "DOMPurify"], xlsx: ["xlsx.full.min.js", "XLSX"], fflate: ["fflate.min.js", "fflate"] };
const loading = {};
export const vendorUrl = (file) => new URL("../vendor/" + file, import.meta.url).href;
export function lib(name) {
  const [file, global] = LIBS[name];
  if (globalThis[global]) return Promise.resolve(globalThis[global]);
  return (loading[name] ??= new Promise((ok, no) => {
    const s = h("script", { src: vendorUrl(file) });
    s.onload = () => ok(globalThis[global]);
    s.onerror = () => { delete loading[name]; no(new Error("lib:" + name)); };
    document.head.append(s);
  }));
}

/** Tiny CSV/TSV parser with quoted fields. */
export function parseCSV(s) {
  const out = []; let row = [], cell = "", q = false;
  const d = s.indexOf("\t") > -1 && s.indexOf(",") < 0 ? "\t" : s.split("\n")[0].split(";").length > s.split("\n")[0].split(",").length ? ";" : ",";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); out.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Minimal Markdown to HTML. Input is escaped first; the result is still sanitized by DOMPurify before display. */
export function markdown(src) {
  const inline = (s) => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<i>$2</i>").replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>');
  const out = []; let list = null, code = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of src.split("\n")) {
    if (line.startsWith("```")) { if (code === null) { close(); code = []; } else { out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>"); code = null; } continue; }
    if (code) { code.push(line); continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)/.exec(line))) { close(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); }
    else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^\s*\d+\.\s+(.*)/.exec(line))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
    else if ((m = /^>\s?(.*)/.exec(line))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
    else if (/^---+$/.test(line.trim())) { close(); out.push("<hr>"); }
    else if (!line.trim()) close();
    else { close(); out.push(`<p>${inline(line)}</p>`); }
  }
  close(); if (code) out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
  return out.join("\n");
}

/** Pick black or white text for a given accent color. */
export function onColor(hex) {
  const n = parseInt(hex.slice(1), 16), [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#0c1022" : "#ffffff";
}
