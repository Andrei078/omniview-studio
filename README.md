# OmniView

Site web static (HTML + CSS + JavaScript, fără server) care deschide, organizează și editează imagini, video, audio, PDF, Word, Excel, CSV și text. **Fișierele nu se încarcă nicăieri**: rămân în browserul utilizatorului (IndexedDB). Funcționează și offline, după prima încărcare (PWA).

Citește **STATUS.md**: spune exact ce este testat, ce nu a fost încercat într-un browser real și ce nu este implementat.

## Pornire locală (Windows)
Dublu-click pe `Porneste-local.bat` (are nevoie de Python sau Node.js) și se deschide http://localhost:8080.
Sau: `npm install` apoi `npm start`.
> Nu deschide `index.html` direct din folder (file://): browserele blochează modulele JavaScript. Folosește un server local sau publică site-ul.

## Publicare (gratuit)
1. `npm install && npm run package` creează folderul `_site/` cu strictul necesar.
2. **Netlify**: https://app.netlify.com/drop → trage folderul `_site`.
   **Cloudflare Pages / orice hosting static**: încarcă conținutul din `_site`.
   **GitHub Pages**: pune proiectul într-un repo, la Settings → Pages alege „GitHub Actions"; fluxul `.github/workflows/pages.yml` rulează testele și publică.
3. Site-ul trebuie servit prin **HTTPS** pentru instalare ca aplicație și mod offline (localhost merge și el).

După ce modifici orice fișier din `css/`, `js/`, `vendor/`, `fonts/`, `icons/` sau `index.html`, rulează `npm run build:sw`
(regenerează `sw.js`; testele verifică asta). Utilizatorii cu versiunea veche văd „A new version is available" și apasă Reload.

## Ce poate
- **Import**: buton, drag-and-drop, foldere întregi, loturi mari, bară de progres, anulare, raport de erori, dubluri omise. Formatul real e detectat din conținut (extensia e doar un indiciu).
- **Bibliotecă**: favorite, etichete, colecții, Coș (cu anulare), căutare, filtre pe tip, sortare, grilă/listă, selecție multiplă și acțiuni în lot, fișiere recente, miniaturi (imagini și video).
- **Vizualizatoare**: imagini (zoom, panoramare, editor: luminozitate/contrast/saturație, rotire, oglindire, undo/redo, export PNG/JPEG/WebP cu calitate și dimensiune), video și audio (viteză, repetare, subtitrări .srt/.vtt, captură de cadru, formă de undă, redare automată a următoarei piese, taste media), PDF (zoom, potrivire lățime/pagină, rotire, miniaturi, căutare în text, revenire la ultima pagină), text/Markdown/JSON (editare, salvare, ciornă recuperabilă, previzualizare Markdown sigură), CSV, DOCX (citire + editare simplă + export HTML / Print-PDF), XLSX (foi, export CSV).
- **Date**: copie de siguranță ZIP (export/restaurare), ștergere completă, afișare spațiu folosit.
- **Setări**: limbă (română/engleză), temă, culoare de accent, mărime interfață, densitate, vizualizare implicită; toate persistente.
- **Accesibilitate**: navigare cu tastatura, focus vizibil, etichete ARIA, respectă „reduce motion". Scurtături: `Ctrl+O`, `Ctrl+Shift+O`, `/`, `←` `→`, `Esc`, `Ctrl+S`, `Delete`, `Ctrl+A`, `Ctrl+,`, `?`.

## Structura
```
index.html  manifest.webmanifest  sw.js (generat)
css/style.css
js/    main.js (pornire) · library.js (date) · db.js · detect.js · views.js (interfață) · viewer.js
       dialogs.js · settings.js · backup.js · i18n.js · util.js · lang/ro.js · viewers/{image,media,pdf,text,docs}.js
vendor/  PDF.js, mammoth, DOMPurify, SheetJS, fflate (locale, fără CDN; licențe în vendor/LICENSES.md)
fonts/  icons/  tests/  scripts/
```
**Alt format nou**: adaugă-l în `js/detect.js` (CAT, MIME, VIEWABLE) și un viewer în `js/viewers/`.
**Altă limbă**: adaugă `js/lang/xx.js` (copiază structura din `ro.js`), înregistrează-o în `js/i18n.js`; `npm test` îți spune exact ce lipsește.

## Teste
`npm test` (55 de teste: detectare, bibliotecă, backup, setări, traduceri complete, resurse offline, aplicația întreagă în jsdom cu viewere reale) și `npm run lint`.
