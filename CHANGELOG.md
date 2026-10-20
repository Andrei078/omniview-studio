# Changelog

## 2.1.0
- **Mobile & tablet**: rebuilt responsive layout (phone: sticky pill navigation, compact header with a "+" import button; tablet: icon rail), touch targets, bottom sheets, long-press selection, per-card "⋯" menu, pinch-to-zoom for images and PDF, viewer actions sheet, safe-area insets. Fixes the broken header/navigation on phones.
- **Subtitles**: new category + Aegisub-style editor for SRT / WebVTT / ASS-SSA; subtitle overlay in the video player (auto-loaded when the name matches); encodings; conversion.
- **New logo** (segmented ring with an eye) that follows the theme; **Halloween theme**.
- Fixes found by real-browser tests: stray text "null" in the text editor and home page, long-press selection triggering a button under the finger, UTF-16 subtitle files mistaken for MP3, invalid settings resetting to defaults.
- New real-browser test suite (`npm run e2e`).

## 2.0.0
Static website rebuild: modular JS, self-hosted libraries, offline PWA, Romanian/English, backup/restore.
