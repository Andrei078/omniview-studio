@echo off
rem Pornește site-ul local pe http://localhost:8080  (modulele JavaScript nu merg dacă deschizi index.html direct din folder)
cd /d "%~dp0"
where python >nul 2>nul && (start "" http://localhost:8080 & python -m http.server 8080 & goto :eof)
where npx >nul 2>nul && (start "" http://localhost:8080 & npx --yes serve -l 8080 . & goto :eof)
echo Ai nevoie de Python sau Node.js instalat. Alternativ, publica folderul pe Netlify / GitHub Pages.
pause
