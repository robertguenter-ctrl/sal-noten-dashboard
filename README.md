# SAL Noten-Dashboard

Bookmarklet-Overlay für die Notenübersicht im SAL-Schulportal (Sekundarschule Baselland).

## Dateien

| Datei | Zweck |
| --- | --- |
| `dashboard.js` | Overlay-Skript (Selektoren oben im Kommentarblock anpassbar) |
| `bookmarklet.txt` | Minimale Bookmarklet-Zeile zum Nachladen von `dashboard.js` |
| `demo.html` | Lokale Testseite mit Beispiel-Notentabelle |

## Bookmarklet

1. Lesezeichen mit der URL aus `bookmarklet.txt` anlegen (zeigt bereits auf Vercel).
2. Auf der SAL-Notenseite das Lesezeichen anklicken (erneut = Toggle).

Live:
- Dashboard-Skript: https://sal-noten-dashboard.vercel.app/dashboard.js
- Demo: https://sal-noten-dashboard.vercel.app/demo.html

```
javascript:(function(){var s=document.createElement('script');s.src='https://sal-noten-dashboard.vercel.app/dashboard.js?t='+Date.now();s.async=true;document.body.appendChild(s);})();
```

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
