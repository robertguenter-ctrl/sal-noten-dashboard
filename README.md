# SAL Noten-Dashboard

Bookmarklet-Overlay für die Notenübersicht im SAL-Schulportal (Sekundarschule Baselland).

## Dateien

| Datei | Zweck |
| --- | --- |
| `dashboard.js` | Overlay-Skript (Selektoren oben im Kommentarblock anpassbar) |
| `bookmarklet.txt` | Minimale Bookmarklet-Zeile zum Nachladen von `dashboard.js` |
| `demo.html` | Lokale Testseite mit Beispiel-Notentabelle |

## Bookmarklet

**Nicht** die `javascript:`-URL in die Chrome-Adresszeile einfügen (wird zur Google-Suche).

1. Öffne die Install-Seite: https://sal-noten-dashboard.vercel.app/install.html
2. Ziehe den blauen Button in die Lesezeichen-Leiste
3. Auf der SAL-Seite «Aktuelle Noten» das Lesezeichen anklicken

Das Install-Bookmarklet enthält den Code **inline** (nötig, weil `portal.sbl.ch` externe Skripte oft per CSP blockiert).

Weitere URLs:
- Demo: https://sal-noten-dashboard.vercel.app/demo.html
- Skript: https://sal-noten-dashboard.vercel.app/dashboard.js

## Berechnung (Zug E)

- Fächer: Deutsch, Französisch, Englisch, Mathematik, Physik, Biologie
- Pro Fach: gewichteter Schnitt → kaufmännische Rundung auf ½-Note
- Schnitt: Mittelwert der 6 Fachnoten (2 Dezimalstellen)
- Punkte: Summe mit **D und M doppelt**
- Plus-/Minuspunkte relativ zu **4.0**; Bedingung: Plus ≥ 2× Minus
- Max. **3** Noten &lt; 4.0
- FMS: Schnitt ≥ **4.5**, Punkte ≥ **36.5**
- Gymnasium: Schnitt ≥ **5.0**, Punkte ≥ **40.5**

## Selektoren anpassen

Siehe Kommentarblock am Anfang von `dashboard.js` (`CONFIG.tableSelector`, Zellenindizes, Aliase).

## Lokal testen

```bash
cd ~/sal-noten-dashboard
python3 -m http.server 8765
```

Dann `http://localhost:8765/demo.html` öffnen.
