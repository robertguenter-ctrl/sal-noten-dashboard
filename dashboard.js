/**
 * =============================================================================
 * SAL Noten-Dashboard (Sekundarschule Baselland) – Bookmarklet Overlay
 * =============================================================================
 *
 * HOSTING: Diese Datei unter einer HTTPS-URL bereitstellen und per Bookmarklet
 *          nachladen (siehe bookmarklet.txt).
 *
 * ---------------------------------------------------------------------------
 * TABELLEN-SELEKTOREN – hier an das konkrete SAL-HTML anpassen
 * ---------------------------------------------------------------------------
 * Die Defaults versuchen, eine typische Notenübersicht zu parsen.
 * Passe die Werte an, sobald du die echte DOM-Struktur im Browser kennst
 * (Rechtsklick → Untersuchen auf der Notenseite).
 *
 * Empfohlenes Vorgehen:
 *  1. In den DevTools prüfen, welches <table>-Element die Fachnoten zeigt.
 *  2. tableSelector / rowSelector / cell-Indizes entsprechend setzen.
 *  3. Falls SAL gewichtete Einzelnoten zeigt: weightCellIndex setzen
 *     (sonst wird jede Zeile als fertige Fachnote gelesen).
 *
 * Live SAL (portal.sbl.ch) – typische Spalten:
 *   0 = Kurs (z. B. "E-3Ed-SaK" + Zeile "Englisch")
 *   1 = Notendurchschnitt (z. B. "5.750", "5.100 *", "--")
 *   2 = Bestätigt  ← NICHT als Note verwenden
 *
 *   tableSelector:      "table"
 *   rowSelector:        "tbody tr, tr"
 *   subjectCellIndex:   0
 *   gradeCellIndex:     1
 *   weightCellIndex:    null
 * =============================================================================
 */
(function () {
  "use strict";

  try {

  // ── Konfiguration (Selektoren & Fach-Aliase) ──────────────────────────────
  const CONFIG = {
    rootId: "sal-noten-dashboard",

    /** CSS-Selektor der Notentabelle(n) */
    tableSelector: "table",

    /** Zeilen innerhalb einer Tabelle (ohne Header) */
    rowSelector: "tbody tr, tr",

    /**
     * Spaltenindizes (0-basiert).
     * Live SAL: 0=Kurs, 1=Notendurchschnitt, 2=Bestätigt
     */
    subjectCellIndex: 0,
    gradeCellIndex: 1,
    weightCellIndex: null, // z. B. 1 – oder null, wenn keine Gewichtungsspalte

    /** Optionale explizite Zell-Selektoren (überschreiben Indizes, wenn gesetzt) */
    subjectCellSelector: null, // z. B. 'td.fach, th.fach'
    gradeCellSelector: null, // z. B. 'td.note'
    weightCellSelector: null, // z. B. 'td.gewicht'

    /** Texte, die als ungültig / zu ignorieren gelten */
    ignoreGradeTexts: [
      "",
      "-",
      "--",
      "–",
      "—",
      ".",
      "*",
      "dispensiert",
      "disp.",
      "n.b.",
      "nb",
      "keine note",
      "k.a.",
    ],

    /**
     * Nur Tabellen mit diesen Header-Stichworten (Live-SAL-Übersicht).
     * Verhindert, dass Einzelprüfungen / andere Listen mitgemischt werden.
     */
    preferTableHeaderHints: ["notendurchschnitt", "aktuelle noten"],

    /**
     * true = nur Zeilen mit SAL-Kurscode (z. B. E-3Ed-SaK), keine losen Namens-Treffer.
     * Verhindert Falsch-Zuordnung aus Detailtabellen.
     */
    requireCourseCode: true,

    /**
     * Pro Fach nur den ersten Treffer aus der Übersichtstabelle behalten
     * (kein Mittelwert über mehrere Tabellen/Prüfungen).
     */
    oneGradePerSubject: true,

    /**
     * Live-SAL-Kurscodes am Zeilenanfang (vor dem ersten Bindestrich).
     * z. B. E-3Ed-SaK → Englisch, P-3Ed-MeC → Physik
     */
    courseCodeMap: {
      B: "Bio",
      D: "D",
      E: "E",
      F: "F",
      M: "M",
      P: "Ph",
    },

    /**
     * Promotionsrelevante Fächer (Niveau E) + Aliase für Namensmatching.
     * key = interner Code, doubleWeight = zählt doppelt bei der Punktesumme.
     */
    subjects: [
      {
        key: "D",
        label: "Deutsch",
        doubleWeight: true,
        aliases: ["deutsch", "d", "deu", "german"],
      },
      {
        key: "M",
        label: "Mathematik",
        doubleWeight: true,
        aliases: ["mathematik", "mathe", "math", "m", "mat"],
      },
      {
        key: "F",
        label: "Französisch",
        doubleWeight: false,
        aliases: ["französisch", "franzosisch", "francais", "français", "f", "fra"],
      },
      {
        key: "E",
        label: "Englisch",
        doubleWeight: false,
        aliases: ["englisch", "english", "e", "eng"],
      },
      {
        key: "Bio",
        label: "Biologie",
        doubleWeight: false,
        aliases: ["biologie", "biology", "bio", "bi"],
      },
      {
        key: "Ph",
        label: "Physik",
        doubleWeight: false,
        aliases: ["physik", "physics", "ph", "phy"],
      },
    ],

    /** Plus/Minus-Schwelle (Beförderung / Kompensation) – für E und P gleich 4.0 */
    threshold: 4.0,

    /**
     * Übertrittsschwellen nach Leistungszug (Laufbahnverordnung BL, ab 01.08.2025).
     * Erkennung aus Klassencode neben dem Namen, z. B. "(3Ed)" → E, "(2Pa)" → P.
     */
    levelProfiles: {
      E: {
        label: "Zug E",
        fms: { label: "FMS", minAverage: 4.5, minPoints: 36.5 },
        gym: { label: "Gymnasium", minAverage: 5.0, minPoints: 40.5 },
      },
      P: {
        label: "Zug P",
        fms: { label: "FMS", minAverage: 4.0, minPoints: 32.5 },
        gym: { label: "Gymnasium", minAverage: 4.0, minPoints: 34.5 },
      },
    },

    /** Max. erlaubte Noten unter Schwellwert (BL: höchstens 3) */
    maxInsufficient: 3,
  };

  // ── Toggle: bereits offen? ────────────────────────────────────────────────
  const existing = document.getElementById(CONFIG.rootId);
  if (existing) {
    existing.remove();
    document.removeEventListener("keydown", onEscClose, true);
    return;
  }

  // ── Hilfsfunktionen ───────────────────────────────────────────────────────
  function normalizeText(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isIgnoredGrade(text) {
    const n = normalizeText(text).replace(/\*/g, "").trim();
    if (!n || /^-+$/.test(n)) return true;
    return CONFIG.ignoreGradeTexts.some((t) => normalizeText(t) === n);
  }

  /** Parst Noten wie "5.5", "5,5", "5.750", "5.100 *" → Number | null */
  function parseGrade(raw) {
    if (raw == null) return null;
    let s = String(raw).trim();
    // Icons/Buttons in derselben Zelle: nur den Notenteil betrachten
    s = s.split(/\n/)[0].trim();
    if (isIgnoredGrade(s)) return null;
    s = s
      .replace(/\*/g, "")
      .replace(/½/g, ".5")
      .replace(/,/g, ".")
      .replace(/[^\d.]/g, "");
    if (!s || s === ".") return null;
    const n = Number(s);
    if (!Number.isFinite(n) || n < 1 || n > 6) return null;
    return n;
  }

  function parseWeight(raw) {
    if (raw == null || String(raw).trim() === "") return 1;
    const s = String(raw).replace(",", ".").replace(/[^\d.]/g, "");
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  /** Kaufmännische Rundung auf 0.5-Schritte (Zeugnisnoten BL) */
  function roundHalfGrade(value) {
    return Math.round(value * 2) / 2;
  }

  function round2(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Ermittelt Leistungszug E/P aus Klassencode.
   * Beispiele: "Aktuelle Noten - Name (3Ed)" → E; Kurs "M-2Pa-XyZ" → P.
   */
  function detectLevel() {
    const candidates = [];
    const pushFromText = (text, source) => {
      const s = String(text || "");
      // "(3Ed)", "(2Pa)", "(1En)"
      const paren = s.match(/\((\d)\s*([EP])([a-z0-9]*)\)/i);
      if (paren) {
        candidates.push({
          code: paren[2].toUpperCase(),
          classCode: paren[1] + paren[2].toUpperCase() + (paren[3] || ""),
          source,
          score: 100,
        });
      }
      // Kurszeile: "E-3Ed-SaK" / "B-2Pd-MeC" (Track steckt in der Klassenkennung)
      const course = s.match(/-\s*(\d)([EP])([a-z])\b/i);
      if (course) {
        candidates.push({
          code: course[2].toUpperCase(),
          classCode: course[1] + course[2].toUpperCase() + course[3],
          source,
          score: 40,
        });
      }
    };

    document
      .querySelectorAll("h1, h2, h3, .page-title, .content h1, .content h2, title")
      .forEach((el) => pushFromText(el.textContent, "Titel/Überschrift"));

    // Fallback: ganze Seite (nur Klassenmuster in Klammern bevorzugen)
    pushFromText(document.body ? document.body.innerText.slice(0, 4000) : "", "Seiteninhalt");

    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length) {
      return {
        code: candidates[0].code,
        classCode: candidates[0].classCode,
        source: candidates[0].source,
        auto: true,
      };
    }
    return {
      code: "E",
      classCode: null,
      source: "Standard (nicht erkannt)",
      auto: false,
    };
  }

  function getProfile(levelCode) {
    return CONFIG.levelProfiles[levelCode] || CONFIG.levelProfiles.E;
  }

  function matchSubject(name, opts) {
    const requireCode = opts && opts.requireCourseCode;
    const raw = String(name || "").trim();
    if (!raw) return null;

    // Live SAL: "E-3Ed-SaK" / "Englisch" (oft zweizeilig in einer Zelle)
    const codeHit = raw.match(/^([A-Za-z]+)\s*-/);
    if (codeHit) {
      const mappedKey = CONFIG.courseCodeMap[codeHit[1].toUpperCase()];
      if (mappedKey) {
        const byCode = CONFIG.subjects.find((s) => s.key === mappedKey);
        if (byCode) return byCode;
      }
      // Anderer Kurscode (GG, eaBO, wpf…): kein Fach-Match über den Namen
      if (requireCode) return null;
    } else if (requireCode) {
      return null;
    }

    const n = normalizeText(raw);
    // Fachname in der Zelle (z. B. zweite Zeile "Englisch")
    for (const sub of CONFIG.subjects) {
      if (n.includes(normalizeText(sub.label))) return sub;
    }
    for (const sub of CONFIG.subjects) {
      for (const alias of sub.aliases) {
        const a = normalizeText(alias);
        // Kurze Aliase (d/e/f/m) nur als ganzes Token, nicht als Prefix von "englisch"
        if (a.length <= 2) {
          if (
            new RegExp("(^|\\s|/)" + a + "(\\s|/|$|\\(|-)", "i").test(n) &&
            !/^[a-z]+-\d/i.test(raw)
          ) {
            return sub;
          }
          continue;
        }
        if (
          n === a ||
          n.startsWith(a + " ") ||
          n.startsWith(a + "(") ||
          n.startsWith(a + "-") ||
          n.startsWith(a + "–") ||
          n.includes("(" + a + ")")
        ) {
          return sub;
        }
      }
    }
    return null;
  }

  function cellText(row, index, selector) {
    if (selector) {
      const el = row.querySelector(selector);
      return el ? el.textContent : "";
    }
    const cells = row.querySelectorAll("th, td");
    if (!cells.length) return "";
    const i = index < 0 ? cells.length + index : index;
    return cells[i] ? cells[i].textContent : "";
  }

  /** Header-Text einer Tabelle (für Übersicht vs. Detail) */
  function tableHeaderText(table) {
    const parts = [];
    table.querySelectorAll("th").forEach((th) => parts.push(th.textContent || ""));
    const caption = table.querySelector("caption");
    if (caption) parts.push(caption.textContent || "");
    // Überschrift direkt vor der Tabelle (h1–h3, .title, …)
    let prev = table.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++, prev = prev.previousElementSibling) {
      parts.push(prev.textContent || "");
    }
    return normalizeText(parts.join(" "));
  }

  function scoreOverviewTable(table) {
    const header = tableHeaderText(table);
    let score = 0;
    for (const hint of CONFIG.preferTableHeaderHints) {
      if (header.includes(normalizeText(hint))) score += 10;
    }
    // Typische Live-SAL-Kurszeilen zählen
    const rows = table.querySelectorAll(CONFIG.rowSelector);
    let courseRows = 0;
    rows.forEach((row) => {
      const subjectRaw = cellText(row, CONFIG.subjectCellIndex, CONFIG.subjectCellSelector);
      if (/^[A-Za-z]{1,6}\s*-\d/.test(String(subjectRaw).trim())) courseRows += 1;
    });
    score += Math.min(courseRows, 20);
    return score;
  }

  function pickTables() {
    const all = Array.from(document.querySelectorAll(CONFIG.tableSelector));
    if (!all.length) return [];
    const ranked = all
      .map((table) => ({ table, score: scoreOverviewTable(table) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    // Nur die beste Übersichtstabelle – keine weiteren mischen
    if (best && best.score > 0) return [best.table];
    return all.slice(0, 1);
  }

  // ── Noten auslesen ────────────────────────────────────────────────────────
  /**
   * Liest die Live-SAL-Übersicht «Aktuelle Noten»:
   * pro promotionsrelevantem Fach genau eine Zeile (Kurscode + Notendurchschnitt).
   */
  function extractGrades() {
    const buckets = Object.create(null);
    for (const sub of CONFIG.subjects) {
      buckets[sub.key] = { meta: sub, entries: [] };
    }

    const tables = pickTables();
    tables.forEach((table) => {
      const rows = table.querySelectorAll(CONFIG.rowSelector);
      rows.forEach((row) => {
        // Header-Zeilen überspringen
        if (row.querySelectorAll("th").length && !row.querySelector("td")) return;

        const subjectRaw = cellText(
          row,
          CONFIG.subjectCellIndex,
          CONFIG.subjectCellSelector
        );
        const gradeRaw = cellText(
          row,
          CONFIG.gradeCellIndex,
          CONFIG.gradeCellSelector
        );
        const matched = matchSubject(subjectRaw, {
          requireCourseCode: CONFIG.requireCourseCode,
        });
        if (!matched) return;

        // Bereits eine Übersichtszelle für dieses Fach? Nicht überschreiben/mischen
        if (CONFIG.oneGradePerSubject && buckets[matched.key].entries.length) return;

        const grade = parseGrade(gradeRaw);
        // "--" zählt als "gefunden, aber keine Note" → kein Entry
        if (grade == null) return;

        let weight = 1;
        if (CONFIG.weightCellIndex != null || CONFIG.weightCellSelector) {
          const weightRaw = cellText(
            row,
            CONFIG.weightCellIndex == null ? 0 : CONFIG.weightCellIndex,
            CONFIG.weightCellSelector
          );
          weight = parseWeight(weightRaw);
        }

        buckets[matched.key].entries.push({
          grade,
          weight,
          rawSubject: subjectRaw.trim(),
          rawGrade: String(gradeRaw).trim().split(/\n/)[0].trim(),
        });
      });
    });

    return CONFIG.subjects.map((sub) => {
      const { entries } = buckets[sub.key];
      if (!entries.length) {
        return {
          ...sub,
          grade: null,
          found: false,
          entryCount: 0,
        };
      }

      // Übersicht: i. d. R. eine Note = Notendurchschnitt → kaufmännisch auf ½ runden
      let sum = 0;
      let wSum = 0;
      for (const e of entries) {
        sum += e.grade * e.weight;
        wSum += e.weight;
      }
      const weighted = wSum > 0 ? sum / wSum : null;
      const rounded = weighted == null ? null : roundHalfGrade(weighted);

      return {
        ...sub,
        grade: rounded,
        weightedRaw: weighted,
        liveAverage: entries[0].grade,
        found: true,
        entryCount: entries.length,
      };
    });
  }

  // ── Promotionsberechnung ──────────────────────────────────────────────────
  function computePromotion(subjects, levelCode) {
    const profile = getProfile(levelCode);
    const trackDefs = { fms: profile.fms, gym: profile.gym };
    const present = subjects.filter((s) => s.found && s.grade != null);
    const missing = subjects.filter((s) => !s.found || s.grade == null);
    const complete = missing.length === 0 && present.length === CONFIG.subjects.length;

    const emptyTrack = (track) => ({
      ...track,
      avgOk: false,
      pointsOk: false,
      plusMinusOk: false,
      countOk: false,
      entryOk: false,
      promoOk: false,
      level: "warn",
      statusLabel: "Unvollständig",
    });

    // Offizielle Kennzahlen erst mit allen 6 Fachnoten – sonst irreführend
    if (!complete) {
      return {
        allSubjects: subjects,
        subjects: present,
        missing,
        complete: false,
        average: null,
        points: null,
        pointSlots: 0,
        maxPoints: 0,
        plus: null,
        minus: null,
        insufficient: null,
        plusMinusOk: false,
        countOk: false,
        fms: emptyTrack(trackDefs.fms),
        gym: emptyTrack(trackDefs.gym),
      };
    }

    // Durchschnitt der (gerundeten) Fachnoten – promotionsrelevante Fächer
    const avg = round2(present.reduce((a, s) => a + s.grade, 0) / present.length);

    // Punktesumme: D und M doppelt
    let points = 0;
    let pointSlots = 0;
    for (const s of present) {
      const mult = s.doubleWeight ? 2 : 1;
      points += s.grade * mult;
      pointSlots += mult;
    }
    points = round2(points);

    const thr = CONFIG.threshold;
    let plus = 0;
    let minus = 0;
    let insufficient = 0;

    for (const s of present) {
      if (s.grade < thr) {
        insufficient += 1;
        minus += thr - s.grade;
      } else if (s.grade > thr) {
        plus += s.grade - thr;
      }
    }
    plus = round2(plus);
    minus = round2(minus);

    // BL: Pluspunkte >= 2 × Minuspunkte
    const plusMinusOk = minus === 0 || plus >= 2 * minus;
    const countOk = insufficient <= CONFIG.maxInsufficient;

    function trackStatus(track) {
      const avgOk = avg >= track.minAverage;
      const pointsOk = points >= track.minPoints;
      const entryOk = avgOk && pointsOk;
      const promoOk = entryOk && plusMinusOk && countOk;
      let level = "fail";
      let label = "Nicht erfüllt";
      if (promoOk) {
        level = "ok";
        label = "Auf Kurs";
      } else if (avgOk || pointsOk || (plusMinusOk && countOk && avg >= thr)) {
        level = "warn";
        label = "Gefährdet";
      }
      return {
        ...track,
        avgOk,
        pointsOk,
        plusMinusOk,
        countOk,
        entryOk,
        promoOk,
        level,
        statusLabel: label,
      };
    }

    return {
      allSubjects: subjects,
      subjects: present,
      missing,
      complete: true,
      average: avg,
      points,
      pointSlots,
      maxPoints: pointSlots * 6,
      plus,
      minus,
      insufficient,
      plusMinusOk,
      countOk,
      fms: trackStatus(trackDefs.fms),
      gym: trackStatus(trackDefs.gym),
    };
  }

  // ── UI ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement("style");
    style.id = CONFIG.rootId + "-styles";
    style.textContent = `
#${CONFIG.rootId}, #${CONFIG.rootId} * { box-sizing: border-box; }
#${CONFIG.rootId} {
  --snd-bg: #0f172a;
  --snd-panel: #111827;
  --snd-card: #1f2937;
  --snd-border: rgba(148,163,184,.18);
  --snd-text: #f8fafc;
  --snd-muted: #94a3b8;
  --snd-ok: #10b981;
  --snd-ok-bg: rgba(16,185,129,.12);
  --snd-warn: #f59e0b;
  --snd-warn-bg: rgba(245,158,11,.12);
  --snd-fail: #ef4444;
  --snd-fail-bg: rgba(239,68,68,.12);
  --snd-accent: #38bdf8;
  --snd-shadow: 0 25px 50px -12px rgba(0,0,0,.55);
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--snd-text);
  pointer-events: none;
}
#${CONFIG.rootId} .snd-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15,23,42,.45);
  backdrop-filter: blur(2px);
  pointer-events: auto;
  animation: snd-fade .2s ease;
}
#${CONFIG.rootId} .snd-drawer {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(420px, 100%);
  background: linear-gradient(180deg, #0b1220 0%, #111827 40%, #0f172a 100%);
  border-left: 1px solid var(--snd-border);
  box-shadow: var(--snd-shadow);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  animation: snd-slide .28s cubic-bezier(.22,1,.36,1);
  overflow: hidden;
}
#${CONFIG.rootId} .snd-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 20px 20px 12px;
  border-bottom: 1px solid var(--snd-border);
}
#${CONFIG.rootId} .snd-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: -.02em;
}
#${CONFIG.rootId} .snd-sub {
  margin: 4px 0 0;
  color: var(--snd-muted);
  font-size: 12px;
}
#${CONFIG.rootId} .snd-level-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin: 0 0 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(31,41,55,.85);
  border: 1px solid var(--snd-border);
}
#${CONFIG.rootId} .snd-level-bar .meta {
  flex: 1;
  min-width: 140px;
  font-size: 12px;
  color: var(--snd-muted);
}
#${CONFIG.rootId} .snd-level-bar strong { color: var(--snd-text); }
#${CONFIG.rootId} .snd-level-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 10px;
  background: rgba(15,23,42,.55);
}
#${CONFIG.rootId} .snd-level-toggle button {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--snd-muted);
  font: inherit;
  font-weight: 700;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
}
#${CONFIG.rootId} .snd-level-toggle button.active {
  background: rgba(56,189,248,.18);
  color: var(--snd-accent);
}
#${CONFIG.rootId} .snd-close {
  appearance: none;
  border: 0;
  background: rgba(148,163,184,.12);
  color: var(--snd-text);
  width: 36px;
  height: 36px;
  border-radius: 10px;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  flex-shrink: 0;
  transition: background .15s ease, transform .15s ease;
}
#${CONFIG.rootId} .snd-close:hover { background: rgba(148,163,184,.22); transform: scale(1.04); }
#${CONFIG.rootId} .snd-body {
  padding: 16px 20px 28px;
  overflow: auto;
  flex: 1;
  -webkit-overflow-scrolling: touch;
}
#${CONFIG.rootId} .snd-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 16px;
}
#${CONFIG.rootId} .snd-stat {
  background: var(--snd-card);
  border: 1px solid var(--snd-border);
  border-radius: 14px;
  padding: 14px;
  min-height: 88px;
}
#${CONFIG.rootId} .snd-stat.wide { grid-column: 1 / -1; }
#${CONFIG.rootId} .snd-stat-label {
  color: var(--snd-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .06em;
  margin-bottom: 6px;
}
#${CONFIG.rootId} .snd-stat-value {
  font-size: 1.85rem;
  font-weight: 750;
  letter-spacing: -.03em;
  line-height: 1.1;
}
#${CONFIG.rootId} .snd-stat-hint {
  margin-top: 4px;
  color: var(--snd-muted);
  font-size: 12px;
}
#${CONFIG.rootId} .snd-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 650;
  border: 1px solid transparent;
}
#${CONFIG.rootId} .snd-badge::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
#${CONFIG.rootId} .snd-badge.ok { color: var(--snd-ok); background: var(--snd-ok-bg); border-color: rgba(16,185,129,.25); }
#${CONFIG.rootId} .snd-badge.warn { color: var(--snd-warn); background: var(--snd-warn-bg); border-color: rgba(245,158,11,.25); }
#${CONFIG.rootId} .snd-badge.fail { color: var(--snd-fail); background: var(--snd-fail-bg); border-color: rgba(239,68,68,.25); }
#${CONFIG.rootId} .snd-section {
  margin-top: 18px;
}
#${CONFIG.rootId} .snd-section h3 {
  margin: 0 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--snd-muted);
  text-transform: uppercase;
  letter-spacing: .05em;
}
#${CONFIG.rootId} .snd-track {
  background: var(--snd-card);
  border: 1px solid var(--snd-border);
  border-radius: 14px;
  padding: 12px 14px;
  margin-bottom: 10px;
}
#${CONFIG.rootId} .snd-track-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}
#${CONFIG.rootId} .snd-track-name { font-weight: 700; }
#${CONFIG.rootId} .snd-checks {
  display: grid;
  gap: 4px;
  font-size: 12px;
  color: var(--snd-muted);
}
#${CONFIG.rootId} .snd-checks span.pass { color: var(--snd-ok); }
#${CONFIG.rootId} .snd-checks span.fail { color: var(--snd-fail); }
#${CONFIG.rootId} .snd-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
#${CONFIG.rootId} .snd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(31,41,55,.85);
  border: 1px solid var(--snd-border);
}
#${CONFIG.rootId} .snd-item .name {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
#${CONFIG.rootId} .snd-item .name strong {
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
#${CONFIG.rootId} .snd-item .name small {
  color: var(--snd-muted);
  font-size: 11px;
}
#${CONFIG.rootId} .snd-grade-pill {
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  min-width: 48px;
  text-align: center;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid transparent;
}
#${CONFIG.rootId} .snd-grade-pill.ok { color: var(--snd-ok); background: var(--snd-ok-bg); border-color: rgba(16,185,129,.22); }
#${CONFIG.rootId} .snd-grade-pill.fail { color: var(--snd-fail); background: var(--snd-fail-bg); border-color: rgba(239,68,68,.22); }
#${CONFIG.rootId} .snd-grade-pill.missing { color: var(--snd-muted); background: rgba(148,163,184,.08); }
#${CONFIG.rootId} .snd-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}
#${CONFIG.rootId} .snd-metric {
  background: rgba(15,23,42,.55);
  border-radius: 10px;
  padding: 10px;
  border: 1px solid var(--snd-border);
}
#${CONFIG.rootId} .snd-metric .k { color: var(--snd-muted); font-size: 11px; }
#${CONFIG.rootId} .snd-metric .v { font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
#${CONFIG.rootId} .snd-empty {
  padding: 16px;
  border-radius: 12px;
  background: var(--snd-warn-bg);
  border: 1px solid rgba(245,158,11,.25);
  color: #fcd34d;
  font-size: 13px;
}
#${CONFIG.rootId} .snd-footer {
  margin-top: 18px;
  color: var(--snd-muted);
  font-size: 11px;
  line-height: 1.5;
}
@keyframes snd-slide {
  from { transform: translateX(100%); opacity: .6; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes snd-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (max-width: 480px) {
  #${CONFIG.rootId} .snd-drawer { width: 100%; }
  #${CONFIG.rootId} .snd-stats { grid-template-columns: 1fr; }
}
`;
    document.head.appendChild(style);
  }

  function closeDashboard() {
    const root = document.getElementById(CONFIG.rootId);
    if (root) root.remove();
    const styles = document.getElementById(CONFIG.rootId + "-styles");
    if (styles) styles.remove();
    document.removeEventListener("keydown", onEscClose, true);
  }

  function onEscClose(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      closeDashboard();
    }
  }

  function fmt(n, digits) {
    if (n == null || Number.isNaN(n)) return "–";
    return Number(n).toLocaleString("de-CH", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function mark(ok) {
    return ok
      ? '<span class="pass">✓ erfüllt</span>'
      : '<span class="fail">✗ nicht erfüllt</span>';
  }

  function render(data) {
    injectStyles();

    const incomplete = !data.complete;
    const missingNames = (data.missing || []).map((s) => s.label).join(", ");
    const levelMeta = data.levelInfo || { code: "E", classCode: null, source: "", auto: false };
    const profile = getProfile(levelMeta.code);
    const levelHint = levelMeta.classCode
      ? `Klassencode «${levelMeta.classCode}»`
      : levelMeta.source || "manuell";

    const overallLevel = incomplete
      ? "warn"
      : data.gym.level === "ok"
        ? "ok"
        : data.fms.level === "ok" || data.fms.level === "warn" || data.gym.level === "warn"
          ? data.gym.level === "ok" || data.fms.level === "ok"
            ? "ok"
            : "warn"
          : "fail";

    const overallLabel = incomplete
      ? "Unvollständig"
      : data.gym.promoOk
        ? "Auf Kurs (Gym)"
        : data.fms.promoOk
          ? "Auf Kurs (FMS)"
          : overallLevel === "warn"
            ? "Gefährdet"
            : "Nicht auf Kurs";

    const root = document.createElement("div");
    root.id = CONFIG.rootId;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "SAL Noten-Dashboard");

    const subjectSource = data.allSubjects || data.subjects;
    const subjectRows = CONFIG.subjects
      .map((meta) => {
        const s = subjectSource.find((x) => x.key === meta.key);
        const missing = !s || !s.found || s.grade == null;
        const grade = missing ? null : s.grade;
        const ok = grade != null && grade >= CONFIG.threshold;
        const pillClass = missing ? "missing" : ok ? "ok" : "fail";
        const weightHint = meta.doubleWeight ? "doppelt gewichtet" : "einfach gewichtet";
        const liveHint =
          !missing && s.liveAverage != null
            ? ` · Live ${fmt(s.liveAverage, 3)} → ${fmt(grade, 1)}`
            : missing
              ? " · noch keine Note"
              : "";
        return `
          <li class="snd-item">
            <div class="name">
              <strong>${meta.label}</strong>
              <small>${weightHint}${liveHint}</small>
            </div>
            <div class="snd-grade-pill ${pillClass}">${missing ? "–" : fmt(grade, 1)}</div>
          </li>`;
      })
      .join("");

    const levelBar = `
          <div class="snd-level-bar">
            <div class="meta">
              Aktiv: <strong>${profile.label}</strong>
              <br>${levelMeta.manual ? "manuell gewählt" : "erkannt aus " + levelHint}
            </div>
            <div class="snd-level-toggle" role="group" aria-label="Leistungszug">
              <button type="button" data-snd-level="E" class="${levelMeta.code === "E" ? "active" : ""}">E</button>
              <button type="button" data-snd-level="P" class="${levelMeta.code === "P" ? "active" : ""}">P</button>
            </div>
          </div>`;

    const statsBlock = incomplete
      ? `
          ${levelBar}
          <div class="snd-empty">
            Kennzahlen erscheinen erst, wenn alle <strong>6 Promotionsfächer</strong> eine Note haben.
            ${
              missingNames
                ? `<br><br>Noch offen: <strong>${missingNames}</strong>`
                : ""
            }
            <br><br>Bisher ${data.subjects.length} von 6 Noten vorhanden – siehe Liste unten.
          </div>`
      : `
          ${levelBar}
          <div class="snd-stats">
            <div class="snd-stat">
              <div class="snd-stat-label">Notenschnitt</div>
              <div class="snd-stat-value">${fmt(data.average, 2)}</div>
              <div class="snd-stat-hint">6 Fächer · gerundet</div>
            </div>
            <div class="snd-stat">
              <div class="snd-stat-label">Status</div>
              <div style="margin-top:6px"><span class="snd-badge ${overallLevel}">${overallLabel}</span></div>
              <div class="snd-stat-hint">Ampel gemäss BL-Regeln (${profile.label})</div>
            </div>
            <div class="snd-stat">
              <div class="snd-stat-label">Ungenügend (&lt; ${fmt(CONFIG.threshold, 1)})</div>
              <div class="snd-stat-value">${data.insufficient}</div>
              <div class="snd-stat-hint">max. ${CONFIG.maxInsufficient} erlaubt</div>
            </div>
            <div class="snd-stat">
              <div class="snd-stat-label">Punktetotal</div>
              <div class="snd-stat-value">${fmt(data.points, 1)}</div>
              <div class="snd-stat-hint">D &amp; M doppelt</div>
            </div>
          </div>

          <div class="snd-metrics">
            <div class="snd-metric">
              <div class="k">Pluspunkte (≥ ${fmt(CONFIG.threshold, 1)})</div>
              <div class="v" style="color:var(--snd-ok)">+${fmt(data.plus, 1)}</div>
            </div>
            <div class="snd-metric">
              <div class="k">Minuspunkte (&lt; ${fmt(CONFIG.threshold, 1)})</div>
              <div class="v" style="color:var(--snd-fail)">−${fmt(data.minus, 1)}</div>
            </div>
          </div>

          <section class="snd-section">
            <h3>Übertritt (${profile.label})</h3>
            ${["fms", "gym"]
              .map((key) => {
                const t = data[key];
                return `
                <div class="snd-track">
                  <div class="snd-track-top">
                    <div class="snd-track-name">${t.label}</div>
                    <span class="snd-badge ${t.level}">${t.statusLabel}</span>
                  </div>
                  <div class="snd-checks">
                    <div>Schnitt ≥ ${fmt(t.minAverage, 1)} (ist ${fmt(data.average, 2)}) ${mark(t.avgOk)}</div>
                    <div>Punkte ≥ ${fmt(t.minPoints, 1)} (ist ${fmt(data.points, 1)}) ${mark(t.pointsOk)}</div>
                    <div>Plus ≥ 2× Minus ${mark(t.plusMinusOk)}</div>
                    <div>≤ ${CONFIG.maxInsufficient} ungenügend ${mark(t.countOk)}</div>
                  </div>
                </div>`;
              })
              .join("")}
          </section>`;

    root.innerHTML = `
      <div class="snd-backdrop" data-snd-close></div>
      <aside class="snd-drawer">
        <header class="snd-header">
          <div>
            <h2 class="snd-title">Noten-Dashboard</h2>
            <p class="snd-sub">Sekundarschule BL · Promotionsfächer · ${profile.label}</p>
          </div>
          <button type="button" class="snd-close" aria-label="Schliessen" data-snd-close>✕</button>
        </header>
        <div class="snd-body">
          ${statsBlock}

          <section class="snd-section">
            <h3>Promotionsfächer</h3>
            <ul class="snd-list">${subjectRows}</ul>
          </section>

          <p class="snd-footer">
            Schwellen Zug E: FMS 4.5 / 36.5 · Gym 5.0 / 40.5 — Zug P: FMS 4.0 / 32.5 · Gym 4.0 / 34.5.
            Kennzahlen erst mit allen 6 Noten. ESC oder ✕ schliesst. Erneuter Klick toggelt.
          </p>
        </div>
      </aside>
    `;

    document.body.appendChild(root);
    root.querySelectorAll("[data-snd-close]").forEach((el) => {
      el.addEventListener("click", closeDashboard);
    });
    root.querySelectorAll("[data-snd-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = btn.getAttribute("data-snd-level");
        if (!next || next === levelMeta.code) return;
        window.__salDashLevelOverride = next;
        showDashboard(next, true);
      });
    });
    document.addEventListener("keydown", onEscClose, true);
  }

  function showDashboard(levelCode, manual) {
    const detected = detectLevel();
    const code = levelCode || window.__salDashLevelOverride || detected.code;
    const data = computePromotion(cachedSubjects, code);
    data.levelInfo = {
      code: code,
      classCode: detected.classCode,
      source: detected.source,
      auto: detected.auto,
      manual: !!manual || (!!window.__salDashLevelOverride && window.__salDashLevelOverride !== detected.code),
    };
    const prev = document.getElementById(CONFIG.rootId);
    if (prev) prev.remove();
    const prevStyles = document.getElementById(CONFIG.rootId + "-styles");
    if (prevStyles) prevStyles.remove();
    document.removeEventListener("keydown", onEscClose, true);
    render(data);
  }

  const cachedSubjects = extractGrades();
  showDashboard(null, false);

  } catch (err) {
    console.error("[SAL Noten-Dashboard]", err);
    alert("SAL Noten-Dashboard Fehler: " + (err && err.message ? err.message : err));
  }
})();
