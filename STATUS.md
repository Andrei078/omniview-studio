# Stare reală a proiectului (versiunea web 2.0)

**T** = testat automat (jsdom + IndexedDB simulat) · **C** = scris, trece analiza statică, dar *nu a fost rulat într-un browser real* · **N** = neimplementat

## Verificat efectiv
| Verificare | Rezultat |
|---|---|
| `npm test` | 55 de teste trec (8 fișiere) |
| `npm run lint` (ESLint `no-undef` pe tot `js/`) | fără erori sau avertismente |
| Instalare de la zero din arhivă + teste | vezi mesajul de livrare |

## Funcții
| Zonă | Stare | Detalii |
|---|---|---|
| Import (fișiere, foldere, drag-and-drop, loturi, progres, anulare, raport erori, dubluri) | **T** | Drag-and-drop real pe foldere (`webkitGetAsEntry`) nu poate fi simulat în jsdom: **C** |
| Detectarea formatului din conținut, avertisment la extensie greșită | **T** | |
| Bibliotecă: favorite, etichete, colecții, Coș, căutare, filtre, sortare, grilă/listă, selecție în lot, recente, persistență | **T** | |
| Copie de siguranță ZIP (export, restaurare, validare) | **T** | Citește tot în memorie: bibliotecile foarte mari pot depăși memoria disponibilă |
| Setări (temă, accent, mărime, densitate, limbă, vizualizare) persistente | **T** | |
| Traduceri română/engleză, complete | **T** | Un test scanează tot codul; traducerea a fost scrisă de asistent, fără verificare de vorbitor nativ |
| Viewer text/Markdown/JSON/CSV, editare, salvare, ciornă | **T** | Previzualizarea Markdown e sanitizată (testat) |
| Viewer DOCX (citire, editare simplă, export HTML) și XLSX (foi, export CSV) | **T** | Rulează biblioteca din `vendor/` pe fișiere generate în test |
| Viewer imagine: zoom/pan, editor, undo/redo | **T** starea editorului · **C** exportul pe canvas și gesturile | |
| Viewer PDF (randare, zoom, miniaturi, căutare, revenire la pagină) | **C** | Nu poate rula în jsdom (cere canvas real). **Prima verificare reală: deschide un PDF.** |
| Viewer video/audio (viteză, subtitrări, captură, formă de undă, piesa următoare) | **C** | Redarea depinde de codecurile browserului |
| Miniaturi imagini și video | **C** | |
| PWA: instalare, offline, notificare de versiune nouă | **C** | `sw.js` e generat și verificat structural (toate resursele sunt în cache), dar nu a rulat într-un browser |
| Aspect, responsivitate, fonturi proprii | **C** | Nu am putut vedea pagina într-un browser. Verifică pe telefon și pe desktop. |
| Logo + iconițe (SVG + PNG generate) | făcut | Iconița PNG a fost verificată vizual |

## Neimplementat (față de specificația inițială, pentru un site)
- PDF: adnotări, evidențiere, formulare, reordonare/combinare/împărțire pagini, marcaje, selecție și copiere de text, OCR.
- DOCX: salvare înapoi ca .docx, antet/subsol, paginare reală. (Export HTML și Print/PDF există.)
- PPTX, DOC, ODT, RTF: recunoscute și listate, dar doar descărcabile.
- TIFF, HEIC, MKV, AVI: recunoscute; se redau doar dacă browserul le suportă (MKV adesea nu).
- Imagini: decupare, redimensionare în pixeli (există scalare procentuală la export), filtre presetate, comparație înainte/după, RAW.
- Conversie media, subtitrări încorporate, mai multe piese audio în aceeași listă (există navigarea prin biblioteca curentă).
- Mai multe proiecte (există o singură bibliotecă + copie de siguranță), scurtături personalizabile, preferințe pe tip de fișier.
- Conturi, sincronizare între dispozitive, încărcare în cloud: deliberat absente (totul e local).

## Limite de știut
- Datele stau în browserul fiecărui utilizator. Ștergerea datelor site-ului sau modul privat le pierde; site-ul cere stocare persistentă, dar browserul decide. Recomandă copia de siguranță.
- Fișierele sunt păstrate ca blob-uri în IndexedDB: limitat de spațiul oferit de browser.
- Nu merge din `file://`; are nevoie de un server (local sau hosting).
- Netestat pe Safari/iOS și Firefox.
