# OmniView 2.1

Site web static (HTML + CSS + JavaScript, fără server) care deschide, organizează și editează imagini, video, audio, PDF, Word, Excel, CSV, text și **subtitrări**. **Fișierele nu se încarcă nicăieri**: rămân în browserul utilizatorului (IndexedDB). Funcționează și offline după prima încărcare (PWA). Optimizat pentru telefon, tabletă și desktop.

Citește **STATUS.md**: spune exact ce este verificat, ce nu a fost încercat pe dispozitive reale și ce nu este implementat.

## Pornire locală (Windows)
Dublu-click pe `Porneste-local.bat` (are nevoie de Python sau Node.js) → http://localhost:8080. Sau `npm install` apoi `npm start`.
> Nu deschide `index.html` direct din folder (file://): browserele blochează modulele JavaScript.
> Ca să testezi pe telefon, deschide adresa calculatorului din aceeași rețea (ex. `http://192.168.x.x:8080`) sau publică site-ul.

## Publicare (gratuit)
1. `npm install --omit=optional && npm run package` → folderul `_site/`.
2. **Netlify**: https://app.netlify.com/drop → trage `_site`. **Cloudflare Pages / orice hosting static**: încarcă `_site`. **GitHub Pages**: pune proiectul într-un repo, la Settings → Pages alege „GitHub Actions" (`.github/workflows/pages.yml` rulează testele și publică).
3. Servește-l prin **HTTPS** (necesar pentru instalare ca aplicație și offline; `localhost` merge și el).

După orice modificare în `css/`, `js/`, `vendor/`, `fonts/`, `icons/` sau `index.html`: `npm run build:sw` (regenerează `sw.js`; un test verifică asta). Utilizatorii cu versiunea veche văd „A new version is available".

## Ce poate
- **Telefon și tabletă**: layout responsiv (pastile de navigare pe telefon, bară de iconițe pe tabletă), tinte tactile mari, apăsare lungă pentru selecție, meniu „⋯" pe carduri, foi de jos pentru dialoguri/meniuri, zoom prin ciupire la imagini și PDF, respectă zonele de siguranță (notch).
- **Subtitrări** (SRT, WebVTT, ASS/SSA) — editor în stil Aegisub: video cu subtitrarea desenată în timp real (stiluri ASS, aliniere, `\pos`, culori, contur), cronologie cu formă de undă și mânere de tras pentru început/sfârșit, grilă cu mii de linii, editare cu undo/redo, `F2`/`F3` setează timpii din video, `F5` redă linia, deplasare/sincronizare în 2 puncte/schimbare FPS, găsește-înlocuiește (inclusiv regex), îmbinare/împărțire, stiluri ASS, verificare calitate (suprapuneri, viteză de citire, durate), codări (UTF-8/16, Windows-1250/1252, ISO-8859-2, 1251) cu corectarea `ş ţ → ș ț`, conversie între SRT/VTT/ASS. În playerul video, subtitrarea cu același nume se activează automat.
- **Teme**: Sistem, Luminos, Întunecat și **Halloween** 🎃 (violet/portocaliu, logo cu pupilă de pisică, pânze și lilieci; respectă „reduce motion"). În perioada 15 oct – 2 nov se oferă o dată.
- **Import** (buton, drag-and-drop, foldere, loturi, progres, anulare, dubluri, raport erori), detectare formatului din conținut, **bibliotecă** (favorite, etichete, colecții, Coș, căutare, filtre, sortare, selecție în lot), copie de siguranță ZIP, română/engleză, setări persistente.
- Viewere: imagini (zoom/pan + editor), video/audio (viteză, repetare, captură de cadru, formă de undă), PDF (zoom, miniaturi, căutare, rotire), text/Markdown/JSON/CSV, DOCX (citire + editare simplă), XLSX.

## Structura
```
index.html  manifest.webmanifest  sw.js (generat)
css/   style.css (layout responsiv) · halloween.css · subs.css
js/    main · library · db · detect · views · viewer · dialogs · settings · backup · i18n · util
       subs.js (format/parsare/operații subtitrări) · subs-overlay.js (desenare) · lang/ro.js
       viewers/ image · media · pdf · text · docs · subs
vendor/ fonts/ icons/   (PDF.js, mammoth, DOMPurify, SheetJS, fflate, fonturi — locale, fără CDN)
tests/  teste unitare (vitest + jsdom)   tests/e2e/  teste în browser real
```
Alt format: `js/detect.js` + un viewer în `js/viewers/`. Altă limbă: `js/lang/xx.js` (copiază `ro.js`) + `js/i18n.js`; `npm test` spune ce lipsește.

## Teste
- `npm test` — 86 de teste (detectare, bibliotecă, backup, setări, traduceri complete, subtitrări, resurse offline, aplicația întreagă în jsdom). `npm run lint`.
- `npm run e2e` — teste într-un **Chromium real** (headless): layout pe 6 dimensiuni de ecran cu capturi (în directorul temporar, `omniview-shots`), subtitrări cu un video înregistrat de browser, gesturi tactile emulate, mod offline. Are nevoie de dependențele opționale (`npm install`, ~70 MB pentru Chromium).
