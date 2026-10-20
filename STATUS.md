# Stare reală a proiectului (versiunea 2.1)

**R** = verificat într-un **Chromium real** (headless, Linux), cu ecran tactil emulat · **T** = test automat în jsdom · **C** = scris și analizat static, neîncercat pe dispozitiv real · **N** = neimplementat

## Verificat efectiv
| Verificare | Rezultat |
|---|---|
| `npm test` (vitest + jsdom) | 86 de teste trec |
| `npm run lint` | fără probleme |
| `npm run e2e` | trece: layout pe 6 dimensiuni (360×740, 390×844, 844×390, 768×1024, 1180×820, 1440×900) fără depășiri orizontale sau erori JS; subtitrări pe 3 dimensiuni; gesturi tactile pe 2; offline |

## Telefon / tabletă
| Zonă | Stare |
|---|---|
| Layout telefon, tabletă (portret/peisaj), desktop; capturi verificate vizual | **R** |
| Foi de jos (setări, meniuri, acțiuni viewer), meniu „⋯" pe carduri | **R** |
| Apăsare lungă pentru selecție (fără click accidental pe butoane) | **R** |
| Zoom prin ciupire la imagini și PDF | **R** (gesturi emulate prin CDP) |
| iPhone/iPad (Safari/WebKit), telefoane Android reale, Firefox | **C** — nu au fost încercate. Dacă pe telefonul tău mai apare ceva, trimite o captură. |
| Tastatura virtuală (redimensionarea ecranului), vibrații, comportamentul barei de adrese | **C** |

## Subtitrări
| Zonă | Stare |
|---|---|
| Parsare/scriere SRT, VTT, ASS/SSA, rotund complet; codări (Windows-1250 etc.); operații de timing; QC | **T** (24 de teste) |
| Detectare din conținut (UTF-8, UTF-16, coduri legacy) | **T** |
| Editor: grilă, editare, undo/redo, salvare, dialoguri, Ctrl+S | **T** + **R** |
| Video cu subtitrare desenată peste el (un WebM înregistrat de browser), `F2`, forma de undă desenată, salvare persistată | **R** |
| Mânere de tras pe cronologie cu degetul/mouse-ul | **C** (codul există; trasul efectiv nu a fost simulat) |
| Randare ASS | aproximativă: aliniere, margini, `\pos`, culori, bold/italic/subliniat/tăiat, contur, umbră, `\fs`, `\fn`. **N:** `\fad`, `\move`, `\clip`, rotații, desene vectoriale, karaoke (`\k`), fonturi încorporate |
| **N** | Aegisub avansat: spectrogramă, automatizări Lua, asistent de traducere, post-procesor de timing, derulare pe cadre, subtitrări bitmap (SUP), MicroDVD/SBV/TTML |
| Video MKV/HEVC etc. | depinde de codecurile browserului; forma de undă doar pentru fișiere ≤ 64 MB |

## Alte funcții
| Zonă | Stare |
|---|---|
| Temă Halloween, logo tematic, sugestia sezonieră | **R** (capturi) / **T** (data) |
| PDF (randare, zoom), DOCX, mod offline cu serverul oprit | **R** |
| Import, bibliotecă, backup, setări, traduceri RO/EN complete | **T** |
| Unchanged: adnotări PDF, salvare DOCX înapoi în .docx, PPTX, decupare imagini, OCR | **N** |

## Limite de știut
- Datele stau în browserul fiecărui utilizator; recomandă copia de siguranță (Setări → Date).
- Nu merge din `file://`; are nevoie de server (local sau hosting).
- Traducerea în română a fost scrisă de asistent, fără verificare de vorbitor nativ.
- Testele în browser rulează în Chromium headless pe Linux; nu înlocuiesc testarea pe telefoane reale.
