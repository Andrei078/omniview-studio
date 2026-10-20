// Real files for browser tests, generated on the fly (no binary fixtures in the repo).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import * as fflate from "fflate";
import XLSX from "xlsx";

function pdf(pages) {
  const objs = []; const add = (s) => (objs.push(s), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>"); add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`); add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((text, i) => { const body = `BT /F1 28 Tf 60 700 Td (${text}) Tj ET\n0.2 0.3 0.9 rg 60 600 300 40 re f`; add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`); add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`); });
  let out = "%PDF-1.4\n"; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
const docx = () => Buffer.from(fflate.zipSync({
  "[Content_Types].xml": fflate.strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  "_rels/.rels": fflate.strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  "word/document.xml": fflate.strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Raport trimestrial: ședință, țintă și înțelegere. A fairly long line to check that text wraps nicely on narrow phone screens without horizontal scrolling.</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold line</w:t></w:r></w:p></w:body></w:document>'),
}));
const xlsx = () => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Name", "Qty", "Price", "Notes"], ["Apple", 3, 1.2, "fresh"], ["Pear", 5, 2.1, "ripe"]]), "Fruit"); return Buffer.from(XLSX.write(wb, { type: "array", bookType: "xlsx" })); };

export async function makeFixtures(dir) {
  mkdirSync(dir, { recursive: true });
  const w = (n, d) => (writeFileSync(join(dir, n), d), join(dir, n));
  const photo = (name, c1, c2) => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><defs><linearGradient id="g"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="1200" height="800" fill="url(#g)"/><circle cx="600" cy="400" r="220" fill="#fff" opacity=".35"/></svg>`)).png().toBuffer().then((b) => w(name, b));
  return {
    png: await photo("sunset.png", "#ff7a59", "#5b4bff"), png2: await photo("forest.png", "#12b8a0", "#103a5c"),
    pdf: w("report.pdf", pdf(["Page one: OmniView report", "Page two: second page", "Page three"])),
    docx: w("letter.docx", docx()), xlsx: w("budget.xlsx", xlsx()),
    txt: w("notes.txt", "Line one\nLine two with ș ț ă î â\n".repeat(20)), md: w("readme.md", "# Title\n\nSome **bold** text and a list:\n\n- one\n- two\n"), csv: w("data.csv", "a,b,c\n1,2,3\n4,5,6\n"),
  };
}

/** A real 4-second WebM (video + audio tone) recorded by the browser itself, plus subtitles that match it. */
export async function makeVideo(page, dir) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d");
    const ac = new AudioContext(), dest = ac.createMediaStreamDestination(), osc = ac.createOscillator(), gain = ac.createGain(); osc.frequency.value = 220; gain.gain.value = 0.3; osc.connect(gain).connect(dest); osc.start();
    const stream = new MediaStream([...c.captureStream(25).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8,opus" }), chunks = []; rec.ondataavailable = (e) => chunks.push(e.data);
    let f = 0; const iv = setInterval(() => { g.fillStyle = `hsl(${(f * 6) % 360} 70% 40%)`; g.fillRect(0, 0, 320, 180); g.fillStyle = "#fff"; g.font = "24px sans-serif"; g.fillText("frame " + f++, 20, 90); }, 40);
    rec.start(); await new Promise((r) => setTimeout(r, 4200)); const done = new Promise((r) => (rec.onstop = r)); rec.stop(); await done; clearInterval(iv); osc.stop();
    const buf = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode(...buf.subarray(i, i + 8192)); return btoa(s);
  });
  const w = (n, d) => (writeFileSync(join(dir, n), d), join(dir, n));
  return {
    video: w("clip.webm", Buffer.from(b64, "base64")),
    srt: w("clip.srt", "1\n00:00:00,500 --> 00:00:02,000\nHello from <i>OmniView</i>\nsecond line\n\n2\n00:00:02,200 --> 00:00:03,500\nȘedință, țintă: ă î â\n"),
    ass: w("styled.ass", "[Script Info]\nTitle: Styled\nScriptType: v4.00+\nPlayResX: 640\nPlayResY: 360\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,28,&H0000FFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,2,1,8,10,10,20,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.50,0:00:03.00,Default,,0,0,0,,{\\c&H0000FF&}Top yellow line\\Nwith {\\i1}italic{\\i0}\n"),
  };
}
