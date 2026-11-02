@echo off
title Klupice Online - Lokalno testiranje
echo ==================================================
echo        Klupice Online (GitHub Pages / Supabase)
echo ==================================================
echo Pokretanje lokalnog poslužitelja na http://localhost:8000
echo.
echo Pritisnite Ctrl+C za zaustavljanje.
echo ==================================================
py -m http.server 8000
pause
