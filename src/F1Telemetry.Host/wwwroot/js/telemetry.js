"use strict";

// Справочники объединены для форматов 2025 и 2026. Где id для одной и той же сущности
// не пересекаются между версиями, мы держим все известные значения в одной таблице —
// браузеру это позволяет одинаково отрисовывать как старые логи, так и live-сессии 2026.
// Если в будущем 2027 переопределит существующий id (например, заменит трассу под тем
// же номером), потребуется разделить лукапы по PacketFormat.

// Participant names come from the game and, in online sessions, are other players'
// nicknames — untrusted input. Always route them through escapeHtml before innerHTML.
function escapeHtml(s) {
    return String(s == null ? "" : s)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// Track IDs — m_trackId (int8, -1 = неизвестно). 42 = Madrid (добавлено в формате 2026).
const TRACK_NAMES = {
    0: "Melbourne",
    2: "Shanghai",
    3: "Sakhir",
    4: "Catalunya",
    5: "Monaco",
    6: "Montreal",
    7: "Silverstone",
    9: "Hungaroring",
    10: "Spa",
    11: "Monza",
    12: "Singapore",
    13: "Suzuka",
    14: "Abu Dhabi",
    15: "Texas",
    16: "Brazil",
    17: "Austria",
    19: "Mexico",
    20: "Baku",
    26: "Zandvoort",
    27: "Imola",
    29: "Jeddah",
    30: "Miami",
    31: "Las Vegas",
    32: "Losail",
    39: "Silverstone (R)",
    40: "Austria (R)",
    41: "Zandvoort (R)",
    42: "Madrid"
};

/** Default pit lane loss (s) when no value is stored for a track. */
const DEFAULT_PIT_TIME_SEC = 23.0;

// Country codes for circuit flags (ISO 3166-1 alpha-2 → /assets/flags/<CC>.svg)
const TRACK_FLAG_MAP = {
    0:  "AU",  // Melbourne
    2:  "CN",  // Shanghai
    3:  "BH",  // Sakhir (Bahrain)
    4:  "ES",  // Catalunya (Spain)
    5:  "MC",  // Monaco
    6:  "CA",  // Montreal (Canada)
    7:  "GB",  // Silverstone (GB)
    9:  "HU",  // Hungaroring
    10: "BE",  // Spa (Belgium)
    11: "IT",  // Monza
    12: "SG",  // Singapore
    13: "JP",  // Suzuka
    14: "AE",  // Abu Dhabi
    15: "US",  // Texas (USA)
    16: "BR",  // Brazil
    17: "AT",  // Austria
    19: "MX",  // Mexico
    20: "AZ",  // Baku (Azerbaijan)
    26: "NL",  // Zandvoort
    27: "IT",  // Imola
    29: "SA",  // Jeddah (Saudi Arabia)
    30: "US",  // Miami (USA)
    31: "US",  // Las Vegas (USA)
    32: "QA",  // Losail (Qatar)
    39: "GB",  // Silverstone (R)
    40: "AT",  // Austria (R)
    41: "NL",  // Zandvoort (R)
    42: "ES",  // Madrid (format 2026)
};

// Session types — приложение Session Types (m_sessionType)
const SESSION_TYPES = {
    0: "Unknown",
    1: "Practice 1",
    2: "Practice 2",
    3: "Practice 3",
    4: "Short Practice",
    5: "Qualifying 1",
    6: "Qualifying 2",
    7: "Qualifying 3",
    8: "Short Qualifying",
    9: "One-Shot Qualifying",
    10: "Sprint Shootout 1",
    11: "Sprint Shootout 2",
    12: "Sprint Shootout 3",
    13: "Short Sprint Shootout",
    14: "One-Shot Sprint Shootout",
    15: "Race",
    16: "Race 2",
    17: "Race 3",
    18: "Time Trial"
};

const WEATHER_NAMES = {
    0: "Clear ☀️", 1: "Light Cloud 🌤", 2: "Overcast ☁️",
    3: "Light Rain 🌧", 4: "Heavy Rain 🌧️", 5: "Storm ⛈"
};

// m_actualTyreCompound — пакет Car Status (разное для F1 Modern / Classic / F2)
const TYRE_COMPOUNDS = {
    16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
    7: "Inter", 8: "Wet",
    9: "Dry", 10: "Wet",
    11: "Super Soft", 12: "Soft", 13: "Medium", 14: "Hard", 15: "Wet",
};

const VISUAL_COMPOUNDS = {
    16: "Soft", 17: "Medium", 18: "Hard", 7: "Inter", 8: "Wet",
    9: "Dry", 10: "Wet",
    15: "Wet", 19: "Super Soft", 20: "Soft", 21: "Medium", 22: "Hard",
};

const ACTUAL_COMPOUNDS = {
    16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
    7: "Inter", 8: "Wet", 9: "Dry", 10: "Wet",
    11: "SS", 12: "S", 13: "M", 14: "H", 15: "W",
};

const COMPOUND_DOT_COLORS = {
    16: "#ff3333", 17: "#ffd700", 18: "#e0e0e0", 7: "#00cc00", 8: "#00a6ff",
    9: "#e0e0e0", 10: "#00a6ff", 15: "#00a6ff",
    19: "#9B3CC4", 20: "#ff3333", 21: "#ffd700", 22: "#e0e0e0",
};

/* Per-lap wear rate (%) per actual compound — from in-game wear rates.
 * IDs 16..22, 7, 8 — F1 25. IDs 11..15 — F2 2024/2025 (identical sets).
 */
const COMPOUND_WEAR_RATE_PCT = {
    20: 0.85,  // C1
    19: 1.06,  // C2
    18: 1.31,  // C3
    17: 1.64,  // C4
    16: 2.14,  // C5
    22: 2.90,  // C6
    7:  0.97,  // Inter
    8:  0.97,  // Wet
    14: 0.85,  // F2 Hard
    13: 1.06,  // F2 Medium
    12: 1.31,  // F2 Soft
    11: 1.64,  // F2 SuperSoft
    15: 0.97,  // F2 Wet
};

function getCompoundWearRate(actualCompoundId) {
    const v = COMPOUND_WEAR_RATE_PCT[actualCompoundId];
    return v != null ? v : null;
}

/* Per-compound temperature zones (°C), derived from the F1 25 / F1 26 / F2
 * vehicle-package physics (TemperatureGrip spline in .vcmpd, converted K→°C):
 *   T < cold           → undercool   (blue,   grip < 99%)
 *   cold ≤ T < pLo     → warming up  (green,  grip ≥ 99%)
 *   pLo ≤ T ≤ pHi      → perfect     (purple, grip ≥ 99.9%)
 *   pHi < T ≤ hot      → overheat    (yellow, grip ≥ 99%)
 *   T > hot            → critical    (red,    grip < 99%)
 *
 * The table is picked per session by m_formula (see getCompoundTempTable):
 * F1 25 ("F1 Modern", formula 0) and F1 26 (formula 13) reuse compound ids
 * 16..22/7/8 but have different physics, so the formula — not the id —
 * disambiguates them. F2 (formula 2) has its own ids 11..15; the F2 2024 and
 * 2025 packages are byte-identical, so a single F2 table covers both years.
 */
const ACTUAL_COMPOUND_TEMP_F1_25 = {
    20: { cold: 70, perfectLow: 90,  perfectHigh: 110, hot: 130 },  // C1
    19: { cold: 60, perfectLow: 90,  perfectHigh: 110, hot: 130 },  // C2
    18: { cold: 60, perfectLow: 80,  perfectHigh: 100, hot: 120 },  // C3
    17: { cold: 50, perfectLow: 80,  perfectHigh: 100, hot: 120 },  // C4
    16: { cold: 40, perfectLow: 70,  perfectHigh: 90,  hot: 110 },  // C5
    22: { cold: 40, perfectLow: 60,  perfectHigh: 80,  hot: 100 },  // C6
    7:  { cold: 20, perfectLow: 50,  perfectHigh: 70,  hot: 90  },  // Inter
    8:  { cold: 20, perfectLow: 40,  perfectHigh: 60,  hot: 80  },  // Wet
};
const ACTUAL_COMPOUND_TEMP_F1_26 = {
    20: { cold: 70, perfectLow: 90,  perfectHigh: 110, hot: 130 },  // C1
    19: { cold: 60, perfectLow: 90,  perfectHigh: 110, hot: 120 },  // C2
    18: { cold: 60, perfectLow: 80,  perfectHigh: 100, hot: 120 },  // C3
    17: { cold: 50, perfectLow: 80,  perfectHigh: 100, hot: 110 },  // C4
    16: { cold: 40, perfectLow: 70,  perfectHigh: 90,  hot: 110 },  // C5
    22: { cold: 40, perfectLow: 60,  perfectHigh: 80,  hot: 110 },  // C6
    7:  { cold: 20, perfectLow: 50,  perfectHigh: 70,  hot: 100 },  // Inter
    8:  { cold: 20, perfectLow: 50,  perfectHigh: 90,  hot: 120 },  // Wet
};
// F2 2024/2025 (identical packages) — actualTyreCompound 11..15.
const ACTUAL_COMPOUND_TEMP_F2 = {
    14: { cold: 70, perfectLow: 90,  perfectHigh: 120, hot: 130 },  // Hard
    13: { cold: 60, perfectLow: 80,  perfectHigh: 110, hot: 120 },  // Medium
    12: { cold: 50, perfectLow: 70,  perfectHigh: 100, hot: 120 },  // Soft
    11: { cold: 40, perfectLow: 60,  perfectHigh: 90,  hot: 110 },  // SuperSoft
    15: { cold: 20, perfectLow: 40,  perfectHigh: 60,  hot: 80  },  // Wet
};
const ACTUAL_COMPOUND_TEMP_DEFAULT = { cold: 60, perfectLow: 90, perfectHigh: 100, hot: 120 };

/* Carcass (inner) temperature zones (°C), from the .vcmpd TemperatureGripCarcas
 * spline — the tyre core runs cooler and peaks in a narrower band than the
 * surface, so the widget colours the inner-temperature readout with these
 * tables instead of the surface ones. Same per-formula selection as above. */
const ACTUAL_COMPOUND_CARCAS_TEMP_F1_25 = {
    20: { cold: 95, perfectLow: 105, perfectHigh: 105, hot: 125 },  // C1
    19: { cold: 85, perfectLow: 95,  perfectHigh: 95,  hot: 115 },  // C2
    18: { cold: 75, perfectLow: 85,  perfectHigh: 95,  hot: 115 },  // C3
    17: { cold: 75, perfectLow: 85,  perfectHigh: 85,  hot: 105 },  // C4
    16: { cold: 65, perfectLow: 75,  perfectHigh: 85,  hot: 105 },  // C5
    22: { cold: 55, perfectLow: 75,  perfectHigh: 75,  hot: 95  },  // C6
    7:  { cold: 55, perfectLow: 65,  perfectHigh: 75,  hot: 95  },  // Inter
    8:  { cold: 45, perfectLow: 55,  perfectHigh: 65,  hot: 85  },  // Wet
};
const ACTUAL_COMPOUND_CARCAS_TEMP_F1_26 = {
    20: { cold: 85, perfectLow: 95,  perfectHigh: 105, hot: 125 },  // C1
    19: { cold: 85, perfectLow: 95,  perfectHigh: 95,  hot: 115 },  // C2
    18: { cold: 75, perfectLow: 85,  perfectHigh: 95,  hot: 115 },  // C3
    17: { cold: 75, perfectLow: 85,  perfectHigh: 85,  hot: 105 },  // C4
    16: { cold: 65, perfectLow: 75,  perfectHigh: 85,  hot: 105 },  // C5
    22: { cold: 65, perfectLow: 75,  perfectHigh: 75,  hot: 95  },  // C6
    7:  { cold: 55, perfectLow: 65,  perfectHigh: 75,  hot: 95  },  // Inter
    8:  { cold: 45, perfectLow: 55,  perfectHigh: 65,  hot: 85  },  // Wet
};
const ACTUAL_COMPOUND_CARCAS_TEMP_F2 = {
    14: { cold: 75, perfectLow: 85,  perfectHigh: 105, hot: 125 },  // Hard
    13: { cold: 65, perfectLow: 85,  perfectHigh: 105, hot: 115 },  // Medium
    12: { cold: 65, perfectLow: 85,  perfectHigh: 95,  hot: 115 },  // Soft
    11: { cold: 55, perfectLow: 75,  perfectHigh: 85,  hot: 105 },  // SuperSoft
    15: { cold: 25, perfectLow: 45,  perfectHigh: 65,  hot: 85  },  // Wet
};
const ACTUAL_COMPOUND_CARCAS_TEMP_DEFAULT = { cold: 75, perfectLow: 85, perfectHigh: 95, hot: 115 };

/* Surface-temperature thresholds where blistering starts (°C).
 * From .vcmpd Min/MaxBlisteringTemperature. min = onset, max = severe damage.
 */
const COMPOUND_BLISTER_TEMP_C = {
    20: { min: 115, max: 155 }, 19: { min: 115, max: 155 }, 18: { min: 115, max: 155 },
    17: { min: 115, max: 155 }, 16: { min: 115, max: 155 }, 22: { min: 115, max: 155 },
    7:  { min: 100, max: 140 }, 8:  { min: 90,  max: 130 },
    // F2 2024/2025
    14: { min: 115, max: 155 }, 13: { min: 115, max: 155 }, 12: { min: 115, max: 155 },
    11: { min: 115, max: 155 }, 15: { min: 90,  max: 130 },
};

/* Tyre-temperature considered "released from pits" / fully active (°C).
 * From .vcmpd PitReleaseTemperature, selected per session by m_formula.
 *   - F1 wets (8): not defined in source (0 K).
 *   - F1 26 raises the Intermediate pit-release from 60°C to 70°C.
 *   - F2: tyre warmers banned since 2020 — cars leave the pits on cold tyres
 *     (PitReleaseTemperature 0 K by design), so F2 has no entry at all.
 */
const COMPOUND_PIT_RELEASE_TEMP_C_F1_25 = {
    20: 70, 19: 70, 18: 70, 17: 70, 16: 70, 22: 70, 7: 60,
};
const COMPOUND_PIT_RELEASE_TEMP_C_F1_26 = {
    20: 70, 19: 70, 18: 70, 17: 70, 16: 70, 22: 70, 7: 70,
};

/* Grip multiplier vs wear% (0..1), sampled at 0/25/50/75/100% from
 * .vcmpd WearGrip spline. Use to predict pace fall-off with wear.
 */
const COMPOUND_WEAR_GRIP = {
    20: [1.000, 0.980, 0.957, 0.928, 0.876],  // C1
    19: [1.000, 0.966, 0.938, 0.906, 0.857],  // C2
    18: [1.000, 0.954, 0.922, 0.887, 0.840],  // C3
    17: [1.000, 0.942, 0.906, 0.867, 0.821],  // C4
    16: [1.000, 0.932, 0.891, 0.852, 0.807],  // C5
    22: [1.000, 0.928, 0.882, 0.842, 0.798],  // C6
    7:  [1.000, 0.992, 0.968, 0.941, 0.894],  // Inter
    8:  [1.000, 0.997, 0.983, 0.971, 0.948],  // Wet
    // F2 2024/2025 (identical)
    14: [1.000, 0.981, 0.957, 0.929, 0.879],  // F2 Hard
    13: [1.000, 0.969, 0.939, 0.904, 0.855],  // F2 Medium
    12: [1.000, 0.955, 0.920, 0.880, 0.832],  // F2 Soft
    11: [1.000, 0.938, 0.898, 0.855, 0.808],  // F2 SuperSoft
    15: [1.000, 0.990, 0.973, 0.960, 0.925],  // F2 Wet
};

const TEMP_COLORS = {
    cold: "#00a6ff",
    normal: "#22c55e",
    perfect: "#b85cff",
    hot: "#eab308",
    critical: "#ef4444",
};

/** Compound-temperature table for the active series, chosen via m_formula.
 *  Unknown formula (e.g. before the first Session packet) falls back to F1 25. */
function getCompoundTempTable(formula) {
    if (formula === FORMULA_F1_26) return ACTUAL_COMPOUND_TEMP_F1_26;
    if (formula === FORMULA_F2) return ACTUAL_COMPOUND_TEMP_F2;
    return ACTUAL_COMPOUND_TEMP_F1_25;
}

function getCompoundTempRange(actualCompoundId, formula = currentFormula) {
    // Compound ids are disjoint between F1 (16..22/7/8) and F2 (11..15), so the
    // cross-table fallbacks recover the right window even if the formula is not
    // yet known when the first telemetry arrives.
    return getCompoundTempTable(formula)[actualCompoundId]
        || ACTUAL_COMPOUND_TEMP_F1_25[actualCompoundId]
        || ACTUAL_COMPOUND_TEMP_F2[actualCompoundId]
        || ACTUAL_COMPOUND_TEMP_DEFAULT;
}

/** Carcass (inner) temperature table for the active series, chosen via m_formula. */
function getCompoundCarcasTempTable(formula) {
    if (formula === FORMULA_F1_26) return ACTUAL_COMPOUND_CARCAS_TEMP_F1_26;
    if (formula === FORMULA_F2) return ACTUAL_COMPOUND_CARCAS_TEMP_F2;
    return ACTUAL_COMPOUND_CARCAS_TEMP_F1_25;
}

function getCompoundCarcasRange(actualCompoundId, formula = currentFormula) {
    return getCompoundCarcasTempTable(formula)[actualCompoundId]
        || ACTUAL_COMPOUND_CARCAS_TEMP_F1_25[actualCompoundId]
        || ACTUAL_COMPOUND_CARCAS_TEMP_F2[actualCompoundId]
        || ACTUAL_COMPOUND_CARCAS_TEMP_DEFAULT;
}

function getCompoundBlisterTemp(actualCompoundId) {
    return COMPOUND_BLISTER_TEMP_C[actualCompoundId] || null;
}

function getCompoundPitReleaseTemp(actualCompoundId, formula = currentFormula) {
    // F2 never warms tyres before release, so it has no table (always null).
    if (formula === FORMULA_F2) return null;
    const table = formula === FORMULA_F1_26
        ? COMPOUND_PIT_RELEASE_TEMP_C_F1_26
        : COMPOUND_PIT_RELEASE_TEMP_C_F1_25;
    const v = table[actualCompoundId];
    return v != null ? v : null;
}

/** Linear-interpolated grip multiplier (0..1) for given wear% (0..100). */
function getCompoundExpectedGrip(actualCompoundId, wearPct) {
    const curve = COMPOUND_WEAR_GRIP[actualCompoundId];
    if (!curve) return null;
    const w = Math.max(0, Math.min(100, Number(wearPct)));
    if (!Number.isFinite(w)) return null;
    const idx = w / 25;
    const i0 = Math.floor(idx);
    if (i0 >= curve.length - 1) return curve[curve.length - 1];
    const t = idx - i0;
    return curve[i0] * (1 - t) + curve[i0 + 1] * t;
}

/** Tooltip line for a compound badge: optimal temp window + blister threshold. */
function getCompoundBadgeTooltip(actualCompoundId) {
    const r = getCompoundTempRange(actualCompoundId);
    const b = getCompoundBlisterTemp(actualCompoundId);
    const parts = [];
    if (r) parts.push(`Optimal ${r.perfectLow}–${r.perfectHigh}°C (≥99% from ${r.cold} to ${r.hot})`);
    if (b) parts.push(`Blister ${b.min}°C / severe ${b.max}°C`);
    return parts.join("\n");
}

/** Render remaining-grip indicator for a tyre set: { html, color } or null. */
function formatTyreSetGrip(actualCompoundId, wearPct) {
    const grip = getCompoundExpectedGrip(actualCompoundId, wearPct);
    if (grip == null) return null;
    const pct = Math.round(grip * 1000) / 10; // one decimal
    let color;
    if (grip >= 0.95)      color = "var(--safe)";
    else if (grip >= 0.90) color = "var(--warning)";
    else                   color = "var(--danger)";
    return { text: `${pct.toFixed(1)}%`, color };
}

function tyreTempColor(temp, range) {
    if (!range) range = ACTUAL_COMPOUND_TEMP_DEFAULT;
    const t = Number(temp);
    if (!Number.isFinite(t) || t <= 0) return null;
    if (t < range.cold) return TEMP_COLORS.cold;
    if (t < range.perfectLow) return TEMP_COLORS.normal;
    if (t <= range.perfectHigh) return TEMP_COLORS.perfect;
    if (t <= range.hot) return TEMP_COLORS.hot;
    return TEMP_COLORS.critical;
}

function tyreTempColorAlpha(temp, range, alpha) {
    const hex = tyreTempColor(temp, range);
    if (!hex) return null;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** m_fuelMix — Car Status */
const FUEL_MIX_NAMES = { 0: "Lean", 1: "Standard", 2: "Rich", 3: "Max" };

/** m_tractionControl — Car Status */
const TRACTION_CONTROL_NAMES = { 0: "Off", 1: "Medium", 2: "Full" };

const PIT_STATUS = { 0: "", 1: "Pitting", 2: "In Pit" };

const DRIVER_STATUS = {
    0: "Garage", 1: "Flying", 2: "In Lap", 3: "Out Lap", 4: "On Track"
};

const EVENT_NAMES = {
    "SSTA": "Session Started", "SEND": "Session Ended", "FTLP": "Fastest Lap",
    "RTMT": "Retirement", "DRSE": "DRS Enabled", "DRSD": "DRS Disabled",
    "TMPT": "Teammate In Pits", "CHQF": "Chequered Flag", "RCWN": "Race Winner",
    "PENA": "Penalty", "SPTP": "Speed Trap", "STLG": "Start Lights",
    "LGOT": "Lights Out", "DTSV": "Drive Through Served", "SGSV": "Stop-Go Served",
    "FLBK": "Flashback", "RDFL": "Red Flag",
    "OVTK": "Overtake", "SCAR": "Safety Car", "COLL": "Collision",
    "BUTN": "Button Status"
};

const PENALTY_CODES = new Set(["PENA", "DTSV", "SGSV"]);

const EVENT_CODE_COLORS = {
    "SSTA": "#22c55e", "SEND": "#22c55e", "LGOT": "#22c55e", "CHQF": "#22c55e",
    "FTLP": "#a855f7", "RCWN": "#c084fc",
    "PENA": "#ef4444", "DTSV": "#ef4444", "SGSV": "#ef4444", "RDFL": "#ef4444",
    "SCAR": "#eab308", "COLL": "#f59e0b", "FLBK": "#f59e0b",
    "DRSE": "#38bdf8", "DRSD": "#38bdf8", "SPTP": "#38bdf8", "STLG": "#38bdf8",
    "OVTK": "#fb923c", "RTMT": "#fb923c", "TMPT": "#fb923c",
    "BUTN": "#6b7280",
};

// Penalty types: F1 25 v3 PDF appendix (event PENA)
const PENALTY_TYPES = {
    0: "Drive through",
    1: "Stop Go",
    2: "Grid penalty",
    3: "Penalty reminder",
    4: "Time penalty",
    5: "Warning",
    6: "Disqualified",
    7: "Removed from formation lap",
    8: "Parked too long timer",
    9: "Tyre regulations",
    10: "This lap invalidated",
    11: "This and next lap invalidated",
    12: "This lap invalidated without reason",
    13: "This and next lap invalidated without reason",
    14: "This and previous lap invalidated",
    15: "This and previous lap invalidated without reason",
    16: "Retired",
    17: "Black flag timer"
};

// Infringement types: F1 25 v3 PDF appendix (event PENA)
const INFRINGEMENT_TYPES = {
    0: "Blocking by slow driving",
    1: "Blocking by wrong way driving",
    2: "Reversing off the start line",
    3: "Big Collision",
    4: "Small Collision",
    5: "Collision failed to hand back position (single)",
    6: "Collision failed to hand back position (multiple)",
    7: "Corner cutting gained time",
    8: "Corner cutting overtake single",
    9: "Corner cutting overtake multiple",
    10: "Crossed pit exit lane",
    11: "Ignoring blue flags",
    12: "Ignoring yellow flags",
    13: "Ignoring drive through",
    14: "Too many drive throughs",
    15: "Drive through reminder serve within n laps",
    16: "Drive through reminder serve this lap",
    17: "Pit lane speeding",
    18: "Parked for too long",
    19: "Ignoring tyre regulations",
    20: "Too many penalties",
    21: "Multiple warnings",
    22: "Approaching disqualification",
    23: "Tyre regulations select single",
    24: "Tyre regulations select multiple",
    25: "Lap invalidated corner cutting",
    26: "Lap invalidated running wide",
    27: "Corner cutting ran wide gained time minor",
    28: "Corner cutting ran wide gained time significant",
    29: "Corner cutting ran wide gained time extreme",
    30: "Lap invalidated wall riding",
    31: "Lap invalidated flashback used",
    32: "Lap invalidated reset to track",
    33: "Blocking the pitlane",
    34: "Jump start",
    35: "Safety car to car collision",
    36: "Safety car illegal overtake",
    37: "Safety car exceeding allowed pace",
    38: "Virtual safety car exceeding allowed pace",
    39: "Formation lap below allowed speed",
    40: "Formation lap parking",
    41: "Retired mechanical failure",
    42: "Retired terminally damaged",
    43: "Safety car falling too far back",
    44: "Black flag timer",
    45: "Unserved stop go penalty",
    46: "Unserved drive through penalty",
    47: "Engine component change",
    48: "Gearbox change",
    49: "Parc Fermé change",
    50: "League grid penalty",
    51: "Retry penalty",
    52: "Illegal time gain",
    53: "Mandatory pitstop",
    54: "Attribute assigned"
};

// --- Доп. приложения из F1_25_UDP_Spec.md (пока не все поля выведены в UI) ---

/** m_resultStatus — Lap Data / Final Classification */
const RESULT_STATUS_NAMES = {
    0: "Invalid", 1: "Inactive", 2: "Active", 3: "Finished", 4: "DNF", 5: "DSQ",
    6: "Not classified", 7: "Retired",
};

/** m_resultReason — Final Classification */
const RESULT_REASON_NAMES = {
    0: "Invalid", 1: "Retired", 2: "Finished", 3: "Terminal damage", 4: "Inactive",
    5: "Not enough laps", 6: "Black flagged", 7: "Red flagged", 8: "Mechanical failure",
    9: "Session skipped", 10: "Session simulated",
};

/** m_surfaceType[4] — Car Telemetry */
const SURFACE_TYPE_NAMES = {
    0: "Tarmac", 1: "Rumble strip", 2: "Concrete", 3: "Rock", 4: "Gravel", 5: "Mud",
    6: "Sand", 7: "Grass", 8: "Water", 9: "Cobblestone", 10: "Metal", 11: "Ridged",
};

/** m_gameMode — Session */
const GAME_MODE_NAMES = {
    4: "Grand Prix '23", 5: "Time Trial", 6: "Splitscreen", 7: "Online Custom",
    15: "Online Weekly Event", 17: "Story Mode (Braking Point)", 27: "My Team Career '25",
    28: "Driver Career '25", 29: "Career '25 Online", 30: "Challenge Career '25",
    75: "Story Mode (APXGP)", 127: "Benchmark",
};

/** m_ruleSet — Session */
const RULESET_NAMES = {
    0: "Practice & Qualifying", 1: "Race", 2: "Time Trial", 12: "Elimination",
};

/** m_teamId — Participants / Lobby / Time Trial. uint16 в формате 2026, uint8 в 2025.
 *  Объединённый словарь покрывает оба формата без коллизий id. */
const TEAM_NAMES = {
    0: "Mercedes", 1: "Ferrari", 2: "Red Bull Racing", 3: "Williams", 4: "Aston Martin",
    5: "Alpine", 6: "RB", 7: "Haas", 8: "McLaren", 9: "Sauber", 41: "F1 Generic",
    104: "F1 Custom Team", 129: "Konnersport", 142: "APXGP '24", 154: "APXGP '25",
    155: "Konnersport '24", 158: "Art GP '24", 159: "Campos '24", 160: "Rodin Motorsport '24",
    161: "AIX Racing '24", 162: "DAMS '24", 163: "Hitech '24", 164: "MP Motorsport '24",
    165: "Prema '24", 166: "Trident '24", 167: "Van Amersfoort '24", 168: "Invicta '24",
    185: "Mercedes '24", 186: "Ferrari '24", 187: "Red Bull Racing '24", 188: "Williams '24",
    189: "Aston Martin '24", 190: "Alpine '24", 191: "RB '24", 192: "Haas '24",
    193: "McLaren '24", 194: "Sauber '24",
    // F2 2025 (format 2026)
    465: "Art GP '25", 466: "Campos '25", 467: "Rodin Motorsport '25", 468: "AIX Racing '25",
    469: "DAMS '25", 470: "Hitech '25", 471: "MP Motorsport '25", 472: "Prema '25",
    473: "Trident '25", 474: "Van Amersfoort Racing '25", 475: "Invicta '25",
    // F1 2026 (format 2026)
    476: "Mercedes '26", 477: "Ferrari '26", 478: "Red Bull Racing '26",
    479: "Williams '26", 480: "Aston Martin '26", 481: "Alpine '26",
    482: "RB '26", 483: "Haas '26", 484: "McLaren '26",
    485: "Audi '26", 486: "Cadillac '26",
};

/**
 * Mirror of C# LiveryColourSelector. Keyed by m_gameYear.
 * - 25: F1 25 base season; Haas slot 0 is red (Ferrari-like), use slot 1.
 * - 26: 2026 Season Pack — no overrides yet; Audi/Cadillac liveries TBD when actual
 *   captured colours land. Add entries here once palette is verified.
 */
const LIVERY_COLOUR_SLOT_OVERRIDES = {
    25: {
        7: 1, // Haas: slot 0 is red (Ferrari-like); use slot 1
    },
    26: {
        // intentionally empty for now
    },
};

function getLiveryColourSlot(gameYear, teamId) {
    const yearMap = LIVERY_COLOUR_SLOT_OVERRIDES[gameYear];
    if (yearMap && yearMap[teamId] != null) return yearMap[teamId];
    return 0;
}

function extractLiveryColor(p, gameYear = 25) {
    if (!p?.liveryColours || p.liveryColours.length === 0) return null;
    const numColours = p.numColours | 0;
    if (numColours === 0) return null;
    const slot = Math.min(getLiveryColourSlot(gameYear, p.teamId), numColours - 1);
    const c = p.liveryColours[slot];
    if (c?.red == null || c?.green == null || c?.blue == null) return null;
    return `#${(1 << 24 | c.red << 16 | c.green << 8 | c.blue).toString(16).slice(1).toUpperCase()}`;
}

function teamAccentColor(teamId, liveryColor) {
    return liveryColor || "#F5F5F5";
}

/** m_platform — Participants / Lobby */
const PLATFORM_NAMES = {
    1: "Steam", 3: "PlayStation", 4: "Xbox", 6: "Origin", 255: "Unknown",
};

/** RTMT event — поле reason */
const RETIREMENT_REASON_NAMES = {
    0: "Invalid", 1: "Retired", 2: "Finished", 3: "Terminal damage", 4: "Inactive",
    5: "Not enough laps", 6: "Black flagged", 7: "Red flagged", 8: "Mechanical failure",
    9: "Session skipped", 10: "Session simulated",
};

/** DRSD event — поле reason */
const DRSD_REASON_NAMES = {
    0: "Wet track", 1: "Safety car deployed", 2: "Red flag", 3: "Min lap not reached",
};

let playerCarIndex = 0;
let participantNames = [];
/** @type {number[]} parallel to participantNames */
let participantTeamIds = [];
/** @type {string[]} parallel to participantNames */
let participantLiveryColors = [];
let lastCarStatusItems = null;
let maxEvents = 500;
let events = [];
let pinnedPenalties = [];

const EVENT_FILTER_KEY = "f1telemetry_event_filter_v1";
const PINNABLE_PENALTY_TYPES = new Set([0, 1, 4]);
let eventFilter = loadEventFilter();

function loadEventFilter() {
    try {
        const raw = localStorage.getItem(EVENT_FILTER_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            const filter = {};
            for (const code of Object.keys(EVENT_NAMES)) {
                filter[code] = saved[code] !== undefined ? saved[code] : (code !== "BUTN");
            }
            return filter;
        }
    } catch (_) { /* ignore */ }
    const filter = {};
    for (const code of Object.keys(EVENT_NAMES)) {
        filter[code] = code !== "BUTN";
    }
    return filter;
}

function saveEventFilter() {
    localStorage.setItem(EVENT_FILTER_KEY, JSON.stringify(eventFilter));
}

let _eventFilterPanel = null;

function closeEventFilterPanel() {
    if (_eventFilterPanel) {
        _eventFilterPanel.remove();
        _eventFilterPanel = null;
    }
}

const SESSION_FIELDS = [
    { id: "track", name: "Track" },
    { id: "session", name: "Session" },
    { id: "weather", name: "Weather" },
    { id: "trackTemp", name: "Track Temp" },
    { id: "airTemp", name: "Air Temp" },
    { id: "progress", name: "Time / Laps" },
    { id: "pitLimit", name: "Pit Limit", defaultHidden: true },
    { id: "aiLevel", name: "AI Level", defaultHidden: true },
    { id: "equalCars", name: "Equal Cars", defaultHidden: true },
    { id: "flags", name: "Flags" },
];
const SESSION_FIELD_VIS_KEY = "f1telemetry_session_fields_v1";
const SESSION_FIELD_ORDER_KEY = "f1telemetry_session_field_order_v1";
let sessionFieldVisibility = loadSessionFieldVisibility();
let sessionFieldOrder = loadSessionFieldOrder();
let _sessionSettingsPanel = null;

function loadSessionFieldVisibility() {
    const defaults = {};
    for (const f of SESSION_FIELDS) defaults[f.id] = !f.defaultHidden;
    try {
        const raw = localStorage.getItem(SESSION_FIELD_VIS_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            // Apply the saved value as-is so both shows (true) and hides (false)
            // persist — defaults differ per field (some start hidden).
            for (const f of SESSION_FIELDS) {
                if (typeof saved[f.id] === "boolean") defaults[f.id] = saved[f.id];
            }
        }
    } catch (_) { /* ignore */ }
    return defaults;
}

function saveSessionFieldVisibility() {
    localStorage.setItem(SESSION_FIELD_VIS_KEY, JSON.stringify(sessionFieldVisibility));
}

function loadSessionFieldOrder() {
    const defaultIds = SESSION_FIELDS.map(f => f.id);
    try {
        const raw = localStorage.getItem(SESSION_FIELD_ORDER_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (Array.isArray(saved)) {
                const known = new Set(defaultIds);
                const seen = new Set();
                const result = [];
                for (const id of saved) {
                    if (known.has(id) && !seen.has(id)) { result.push(id); seen.add(id); }
                }
                for (const id of defaultIds) if (!seen.has(id)) result.push(id);
                return result;
            }
        }
    } catch (_) { /* ignore */ }
    return defaultIds;
}

function saveSessionFieldOrder() {
    localStorage.setItem(SESSION_FIELD_ORDER_KEY, JSON.stringify(sessionFieldOrder));
}

function applySessionFieldVisibility() {
    document.querySelectorAll("[data-session-field]").forEach(box => {
        const field = box.dataset.sessionField;
        box.hidden = sessionFieldVisibility[field] === false;
    });
}

function applySessionFieldOrder() {
    document.querySelectorAll(".session-grid").forEach(grid => {
        const boxes = new Map();
        grid.querySelectorAll(":scope > [data-session-field]").forEach(b => {
            boxes.set(b.dataset.sessionField, b);
        });
        for (const id of sessionFieldOrder) {
            const b = boxes.get(id);
            if (b) grid.appendChild(b);
        }
    });
}

/** Move `fromId` to `toId`'s slot in the persisted order, then re-apply to the DOM. */
function reorderSessionField(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    const from = sessionFieldOrder.indexOf(fromId);
    const to = sessionFieldOrder.indexOf(toId);
    if (from < 0 || to < 0) return;
    sessionFieldOrder.splice(from, 1);
    sessionFieldOrder.splice(to, 0, fromId);
    saveSessionFieldOrder();
    applySessionFieldOrder();
}

let _sessionDragId = null;

/** Drag-to-reorder Session tiles by their grip. Scoped to the tiles so it never
    triggers the GridStack widget move (which is bound to .widget-drag-handle). */
function wireSessionDragDrop() {
    document.querySelectorAll(".session-grid").forEach(grid => {
        if (grid.dataset.dndBound === "1") return;
        grid.dataset.dndBound = "1";
        grid.querySelectorAll(":scope > [data-session-field]").forEach(tile => {
            const grip = tile.querySelector(".session-tile-grip");
            if (grip) {
                // Only a grip press arms the native drag; released after drag ends.
                grip.addEventListener("mousedown", () => { tile.draggable = true; });
                grip.addEventListener("mouseup", () => { tile.draggable = false; });
            }
            tile.addEventListener("dragstart", (e) => {
                _sessionDragId = tile.dataset.sessionField;
                e.dataTransfer.effectAllowed = "move";
                try { e.dataTransfer.setData("text/plain", _sessionDragId); } catch (_) { /* ignore */ }
                tile.classList.add("session-tile-dragging");
            });
            tile.addEventListener("dragend", () => {
                tile.draggable = false;
                tile.classList.remove("session-tile-dragging");
                _sessionDragId = null;
                grid.querySelectorAll(".session-drop-target").forEach(t => t.classList.remove("session-drop-target"));
            });
            tile.addEventListener("dragover", (e) => {
                if (!_sessionDragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (tile.dataset.sessionField !== _sessionDragId) tile.classList.add("session-drop-target");
            });
            tile.addEventListener("dragleave", () => {
                tile.classList.remove("session-drop-target");
            });
            tile.addEventListener("drop", (e) => {
                if (!_sessionDragId) return;
                e.preventDefault();
                tile.classList.remove("session-drop-target");
                reorderSessionField(_sessionDragId, tile.dataset.sessionField);
            });
        });
    });
}

function closeSessionSettingsPanel() {
    if (_sessionSettingsPanel) {
        _sessionSettingsPanel.remove();
        _sessionSettingsPanel = null;
    }
}

function initSessionSettings() {
    applySessionFieldOrder();
    applySessionFieldVisibility();
    wireSessionDragDrop();

    const btn = document.getElementById("btnSessionSettings");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (_sessionSettingsPanel) { closeSessionSettingsPanel(); return; }

        const panel = document.createElement("div");
        panel.className = "event-filter-panel session-settings-panel";
        _sessionSettingsPanel = panel;
        renderSessionSettingsPanel(panel);

        const rect = btn.getBoundingClientRect();
        panel.style.top = (rect.bottom + 4) + "px";
        panel.style.left = Math.max(4, rect.right - 240) + "px";

        document.body.appendChild(panel);
        panel.addEventListener("click", (ev) => ev.stopPropagation());
    });

    document.addEventListener("click", (e) => {
        if (_sessionSettingsPanel && !_sessionSettingsPanel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            closeSessionSettingsPanel();
        }
    });
}

function renderSessionSettingsPanel(panel) {
    const nameById = new Map(SESSION_FIELDS.map(f => [f.id, f.name]));
    let html = '<div class="event-filter-actions">'
        + '<button class="event-filter-action-btn" data-ss-action="all">All</button>'
        + '<button class="event-filter-action-btn" data-ss-action="none">None</button></div>';
    sessionFieldOrder.forEach((id) => {
        const checked = sessionFieldVisibility[id] !== false ? "checked" : "";
        html += `<div class="event-filter-item session-settings-row">
            <label class="session-settings-label"><input type="checkbox" data-session-field-id="${id}" ${checked}>${nameById.get(id) || id}</label>
        </div>`;
    });
    html += '<div class="session-settings-hint">Drag tiles by ⠿ to reorder.</div>';
    panel.innerHTML = html;

    panel.querySelectorAll("input[data-session-field-id]").forEach(cb => {
        cb.addEventListener("change", () => {
            sessionFieldVisibility[cb.dataset.sessionFieldId] = cb.checked;
            saveSessionFieldVisibility();
            applySessionFieldVisibility();
        });
    });

    panel.querySelector('[data-ss-action="all"]')?.addEventListener("click", () => {
        for (const f of SESSION_FIELDS) sessionFieldVisibility[f.id] = true;
        saveSessionFieldVisibility();
        applySessionFieldVisibility();
        renderSessionSettingsPanel(panel);
    });
    panel.querySelector('[data-ss-action="none"]')?.addEventListener("click", () => {
        for (const f of SESSION_FIELDS) sessionFieldVisibility[f.id] = false;
        saveSessionFieldVisibility();
        applySessionFieldVisibility();
        renderSessionSettingsPanel(panel);
    });
}

let _tyreInfoPanel = null;

function initTyreInfoTooltip() {
    document.querySelectorAll(".tyre-info-btn:not(.ld-legend-btn)").forEach(btn => {
        if (btn.dataset.tiWired) return;
        btn.dataset.tiWired = "1";
        btn.addEventListener("mouseenter", () => openTyreInfo(btn));
        btn.addEventListener("mouseleave", closeTyreInfo);
        btn.addEventListener("focus", () => openTyreInfo(btn));
        btn.addEventListener("blur", closeTyreInfo);
    });
}

function openTyreInfo(anchor) {
    closeTyreInfo();
    const panel = document.createElement("div");
    panel.className = "tyre-info-panel";

    if (anchor.dataset.legend === "tyreSets") {
        panel.innerHTML =
            `<div class="tip-section"><div class="tip-title">Set row</div>` +
            `<div class="tip-row"><span class="tl-swatch tl-swatch-wearbar"></span><span><b>Wear bar</b> + % · fills & reddens as the tyre wears</span></div>` +
            `<div class="tip-row"><span class="tl-swatch" style="width:3px;border-radius:2px;background:#ff3333"></span><span><b>Left accent</b> · compound colour</span></div>` +
            `<div class="tip-row"><span class="tl-text" style="color:var(--accent-green)">−0.2s</span><span><b>Δ</b> vs fitted lap pace · faster / slower</span></div>` +
            `<div class="tip-row"><span class="tl-text">8L</span><span><b>Laps</b> run on the set</span></div>` +
            `<div class="tip-row"><span class="tl-text" style="color:var(--warning)">87%</span><span><b>Grip</b> estimate · decays with wear</span></div></div>` +
            `<div class="tip-section"><div class="tip-title">Fitted</div>` +
            `<div class="tip-row"><span class="tl-swatch tl-swatch-fitrow"></span><span>Highlighted row + top summary = set <b>fitted to the car</b></span></div></div>` +
            `<div class="tip-section"><div class="tip-title">Compounds</div>` +
            `<div class="tip-compounds">` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#9B3CC4"></span>Super Soft</span>` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#ff3333"></span>Soft</span>` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#ffd700"></span>Medium</span>` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#e0e0e0"></span>Hard</span>` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#00cc00"></span>Inter</span>` +
            `<span class="tip-comp"><span class="tl-swatch tl-swatch-circle" style="background:#00a6ff"></span>Wet</span>` +
            `</div></div>`;
    } else {
        panel.innerHTML =
            `<div class="tip-section"><div class="tip-title">Legend</div>` +
            `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="#ef4444" stroke-width="2" fill="none"/></svg><span>Border = Surface temp</span></div>` +
            `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="#22c55e" stroke-opacity="0.35" stroke-width="1.5" fill="#22c55e"/></svg><span>Fill = Carcass temp</span></div>` +
            `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none"/><rect x="1.5" y="8" width="11" height="5.5" rx="0 0 2 2" fill="#b45309" opacity="0.7"/></svg><span>Level = Wear</span></div></div>` +
            `<div class="tip-section"><div class="tip-title">Temperature scale</div>` +
            `<div class="tip-scale">` +
            `<span class="tip-zone" style="background:#00a6ff">Cold</span>` +
            `<span class="tip-zone" style="background:#22c55e">Normal</span>` +
            `<span class="tip-zone" style="background:#b85cff">Perfect</span>` +
            `<span class="tip-zone" style="background:#eab308">Hot</span>` +
            `<span class="tip-zone" style="background:#ef4444">Overheat</span>` +
            `</div>` +
            `<div class="tip-desc">&lt;99% · ≥99% · 100% grip · ≥99% · &lt;99%</div></div>`;
    }

    document.body.appendChild(panel);
    _tyreInfoPanel = panel;

    const r = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth;
    let left = r.right - pw;
    if (left < 4) left = 4;
    if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
    panel.style.left = left + "px";
    panel.style.top = (r.bottom + 6) + "px";
}

function closeTyreInfo() {
    if (_tyreInfoPanel) {
        _tyreInfoPanel.remove();
        _tyreInfoPanel = null;
    }
}

function initEventFilter() {
    const btn = document.getElementById("btnEventFilter");
    if (!btn) return;

    btn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (_eventFilterPanel) { closeEventFilterPanel(); return; }

        const panel = document.createElement("div");
        panel.className = "event-filter-panel";
        _eventFilterPanel = panel;

        let html = '<div class="event-filter-actions">'
            + '<button class="event-filter-action-btn" data-ef-action="all">All</button>'
            + '<button class="event-filter-action-btn" data-ef-action="none">None</button></div>';
        for (const [code, name] of Object.entries(EVENT_NAMES)) {
            const checked = eventFilter[code] !== false ? "checked" : "";
            const codeCol = EVENT_CODE_COLORS[code] || "var(--accent-blue)";
            html += `<label class="event-filter-item"><input type="checkbox" data-event-code="${code}" ${checked}><span class="event-filter-code" style="color:${codeCol}">${code}</span>${name}</label>`;
        }
        panel.innerHTML = html;

        const rect = btn.getBoundingClientRect();
        panel.style.top = (rect.bottom + 4) + "px";
        panel.style.left = Math.max(4, rect.right - 260) + "px";

        document.body.appendChild(panel);

        panel.addEventListener("click", (ev) => ev.stopPropagation());

        panel.querySelectorAll("input[data-event-code]").forEach(cb => {
            cb.addEventListener("change", () => {
                eventFilter[cb.dataset.eventCode] = cb.checked;
                saveEventFilter();
                renderEvents();
            });
        });

        panel.querySelector('[data-ef-action="all"]')?.addEventListener("click", () => {
            for (const code of Object.keys(EVENT_NAMES)) eventFilter[code] = true;
            panel.querySelectorAll("input[data-event-code]").forEach(cb => { cb.checked = true; });
            saveEventFilter();
            renderEvents();
        });
        panel.querySelector('[data-ef-action="none"]')?.addEventListener("click", () => {
            for (const code of Object.keys(EVENT_NAMES)) eventFilter[code] = false;
            panel.querySelectorAll("input[data-event-code]").forEach(cb => { cb.checked = false; });
            saveEventFilter();
            renderEvents();
        });
    });

    document.addEventListener("click", (e) => {
        if (_eventFilterPanel && !_eventFilterPanel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
            closeEventFilterPanel();
        }
    });
}
/** Last packet header session UID; when it changes, a new in-game session started. */
let lastTelemetrySessionUid = null;
let prevTrackTemp = null;
let prevAirTemp = null;
let trackTempHistory = [];
let airTempHistory = [];
const TEMP_HISTORY_MAX = 30;
let currentTrackId = -1;
let lastLapDataPacket = null;
let lastSessionPacket = null;
let lastCarDamagePacket = null;
/** Max lapDistance (m) seen this session — fallback when trackLength missing */
let gapRingObservedMaxLapDist = 0;
const sessionHistories = {};
/** Last full Car Setups packet (all cars) — used by Lap Times setup popover. */
let lastCarSetupsPacket = null;
/** Per-lap setup snapshots received from backend: { lapIndex: setupObject } */
let _lapSetupSnapshots = {};
/** Per-lap tyre snapshots received from backend: { lapIndex: { actualTyreCompound, visualTyreCompound, tyresAgeLaps, tyresWear[] } } */
let _lapTyreSnapshots = {};
/** Time Trial packet (session / personal / rival rows). */
let lastTimeTrialPacket = null;
let _lapTimesSetupIdSeq = 0;
const _lapTimesSetupContent = new Map();
let _lapTimesMenuBound = false;
const GAP_BOARD_LAPS = 4;

/** Max speed (km/h) seen this session per car index (Car Telemetry). 24 slots covers
 *  both format 2025 (22 cars) and 2026 (24 cars); unused slots stay at 0. */
const sessionTopSpeedByCar = new Array(24).fill(0);
/** Player peak speed on the current lap number (reset when lap advances). */
let playerLapPeakSpeed = 0;
let playerLapPeakForLapNum = 0;
/** Player peak speed on the last completed lap (saved when lap number advances). */
let playerLastLapPeakSpeed = 0;
let _topSpeedLayoutObserver = null;
const _topSpeedObservedRoots = new WeakSet();

/** Throttle / brake traces for Car Telemetry pedal chart (0..1 samples, oldest → newest). */
const PEDAL_HISTORY_LEN = 180;
const pedalHistoryT = [];
const pedalHistoryB = [];

/** m_maxRPM from Car Status (rev limiter); 0 until first Car Status for this session. */
let playerMaxRpm = 0;
const RPM_SCALE_FALLBACK = 15000;
let _lastRpmScale = 0;
let _pedalChartRafId = 0;
/** Absolute RPM thresholds for bar colours (vs current max RPM scale). */
const RPM_BAR_GREEN_END = 11000;
const RPM_BAR_GRADIENT_END = 12000;
let lastSessionLinkId = null;
let playerVisualTyreCompound = -1;
let playerActualTyreCompound = -1;
let lastPlayerCarTelemetry = null;

/** m_formula from Session. 13 = "F1 26" (Active Aero — DRS replaced by Straight Mode);
 *  everything else, incl. 0 "F1 Modern"/F1 25 and 2 "F2", keeps DRS in the Car Telemetry widget. */
const FORMULA_F1_26 = 13;
/** m_formula 2 = "F2" — selects the F2 tyre-compound temperature table. */
const FORMULA_F2 = 2;
let currentFormula = -1;
/** Active-aero straight mode for the player car, mirrored from CarTelemetry26 (F1 26 only). */
let playerStraightModeActive = false;

function el(id) { return document.getElementById(id); }

// At 60 Hz telemetry a single LapData packet triggers 5 full-table re-renders.
// Coalesce heavy widget updates into one per animation frame; if the tab is
// hidden, the browser pauses rAF and we skip rendering entirely.
const _rafTasks = new Map();
let _rafScheduled = false;

function scheduleRafUpdate(key, fn) {
    _rafTasks.set(key, fn);
    if (_rafScheduled) return;
    _rafScheduled = true;
    requestAnimationFrame(() => {
        _rafScheduled = false;
        const tasks = Array.from(_rafTasks.values());
        _rafTasks.clear();
        for (const task of tasks) {
            try { task(); } catch (e) { console.error(e); }
        }
    });
}

function setText(id, text) {
    const e = el(id);
    if (e) e.textContent = text;
}

function setHtml(id, html) {
    const e = el(id);
    if (e) e.innerHTML = html;
}

const TYRE_CORNERS = ["RL", "RR", "FL", "FR"];

/** Cached tyre-widget DOM references. Cleared on widget add/remove. */
const _tyreWidgetCache = new Map();

function getTyreWidgetNodes() {
    for (const w of _tyreWidgetCache.keys()) {
        if (!w.isConnected) _tyreWidgetCache.delete(w);
    }
    document.querySelectorAll(".tyre-widget").forEach(w => {
        if (_tyreWidgetCache.has(w)) return;
        const corners = new Map();
        for (const corner of TYRE_CORNERS) {
            const card = w.querySelector(`.tc[data-tyre-corner="${corner}"]`);
            if (!card) continue;
            corners.set(corner, {
                card,
                fill: card.querySelector(".tc-fill"),
                nodeS: card.querySelector(".tc-ts"),
                nodeI: card.querySelector(".tc-ti"),
                icos: card.querySelectorAll(".tc-temps .tc-ico"),
                psiEl: card.querySelector(".tc-psi"),
                wearNode: card.querySelector(".tc-wear"),
                blsNode: card.querySelector(".tc-bls"),
            });
        }
        _tyreWidgetCache.set(w, {
            corners,
            dot: w.querySelector("[data-ti-dot]"),
            name: w.querySelector("[data-ti-name]"),
            rng: w.querySelector("[data-ti-range]"),
            age: w.querySelector("[data-ti-age]"),
        });
    });
    return _tyreWidgetCache;
}

function formatDeg(v) {
    if (v === undefined || v === null || v === 0) return "--";
    return v + "°";
}

function setTyreWidgetTemps(car) {
    const inner = car.tyresInnerTemperature;
    const surf = car.tyresSurfaceTemperature;
    const press = car.tyresPressure;
    if ((!inner || inner.length < 4) && (!surf || surf.length < 4)) return;

    const range = getCompoundTempRange(playerActualTyreCompound);
    const carcasRange = getCompoundCarcasRange(playerActualTyreCompound);
    const blister = getCompoundBlisterTemp(playerActualTyreCompound);
    for (const [, wc] of getTyreWidgetNodes()) {
        for (let i = 0; i < 4; i++) {
            const c = wc.corners.get(TYRE_CORNERS[i]);
            if (!c) continue;

            const ts = surf?.[i];
            const ti = inner?.[i];
            const surfCol = tyreTempColor(ts, range);
            const innerCol = tyreTempColor(ti, carcasRange);

            const tsNum = Number(ts);
            const inBlister = blister && Number.isFinite(tsNum) && tsNum >= blister.min;
            c.card.classList.toggle("tc-blister-risk", !!inBlister);

            c.card.style.borderColor = surfCol || "var(--border)";
            c.card.style.boxShadow = inBlister
                ? `0 0 12px rgba(239,68,68,0.6)`
                : (surfCol ? `0 0 8px ${tyreTempColorAlpha(ts, range, 0.3)}` : "");
            if (c.fill) c.fill.style.background = innerCol ? tyreTempColorAlpha(ti, carcasRange, 0.12) : "";
            if (c.nodeS) { c.nodeS.textContent = formatDeg(ts); c.nodeS.style.color = surfCol || ""; }
            if (c.nodeI) { c.nodeI.textContent = formatDeg(ti); c.nodeI.style.color = innerCol || ""; }
            if (c.icos[0]) c.icos[0].style.color = surfCol || "var(--text-dim)";
            if (c.icos[1]) c.icos[1].style.color = innerCol || "var(--text-dim)";
            if (c.psiEl) c.psiEl.textContent = press?.[i] != null ? press[i].toFixed(1) + " psi" : "-- psi";
        }
    }
}

function setTyreWidgetWear(car) {
    const wear = car?.tyresWear;
    const blisters = car?.tyreBlisters;

    for (const [, wc] of getTyreWidgetNodes()) {
        for (let i = 0; i < 4; i++) {
            const c = wc.corners.get(TYRE_CORNERS[i]);
            if (!c) continue;

            const w_ = wear?.[i];
            const pct = (w_ != null && Number.isFinite(Number(w_))) ? Math.min(100, Math.max(0, Number(w_))) : null;

            if (c.wearNode) c.wearNode.textContent = pct !== null ? Math.round(pct) + "%" : "--";
            if (c.fill) c.fill.style.height = pct !== null ? (100 - pct) + "%" : "100%";
            if (c.blsNode) c.blsNode.textContent = blisters?.[i] != null ? `Blisters ${blisters[i]}%` : "Blisters --";
        }
    }
}

function setTyreWidgetCompoundAge(car) {
    if (!car) return;
    const visual = VISUAL_COMPOUNDS[car.visualTyreCompound] || "--";
    const actual = ACTUAL_COMPOUNDS[car.actualTyreCompound] || "";
    const dotCol = COMPOUND_DOT_COLORS[car.visualTyreCompound] || "var(--text-dim)";
    const range = getCompoundTempRange(car.actualTyreCompound);
    const blister = getCompoundBlisterTemp(car.actualTyreCompound);

    const nameText = actual ? `${actual}` : visual;
    const rangeText = blister
        ? `${range.perfectLow}–${range.perfectHigh}°C · ⚠ ${blister.min}°C`
        : `${range.perfectLow}–${range.perfectHigh}°C`;
    const ageText = `${car.tyresAgeLaps} laps`;

    for (const [, wc] of getTyreWidgetNodes()) {
        if (wc.dot) wc.dot.style.background = dotCol;
        if (wc.name) wc.name.textContent = nameText;
        if (wc.rng) wc.rng.textContent = rangeText;
        if (wc.age) wc.age.textContent = ageText;
    }
}

/** Grey track; clipped fill: green/gradient/red split using fixed 11k/12k thresholds. */
function syncRpmBarSegmentWidths(scale) {
    const s = scale > 0 ? scale : RPM_SCALE_FALLBACK;
    const greenEnd = Math.min(RPM_BAR_GREEN_END, s);
    const gradEnd = Math.min(RPM_BAR_GRADIENT_END, s);
    const wGreen = greenEnd;
    const wGradient = Math.max(0, gradEnd - greenEnd);
    const wRed = Math.max(0, s - gradEnd);
    const setFlex = (id, w) => {
        const node = el(id);
        if (node) node.style.flex = `${w} 0 0`;
    };
    setFlex("rpmSegGreen", wGreen);
    setFlex("rpmSegGradient", wGradient);
    setFlex("rpmSegRed", wRed);
}

function formatTime(ms) {
    if (!ms || ms === 0) return "--";
    const totalSec = ms / 1000;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}:${sec.toFixed(3).padStart(6, "0")}` : `${sec.toFixed(3)}`;
}

/** Lap-style clock: MM:SS.mmm, or HH:MM:SS.mmm when >= 1h (server lapTime is seconds). */
function formatLapClock(ms) {
    if (ms == null || ms === 0) return "--";
    const x = Math.round(ms);
    const msPart = x % 1000;
    let t = Math.floor(x / 1000);
    const s = t % 60;
    t = Math.floor(t / 60);
    const m = t % 60;
    const h = Math.floor(t / 60);
    const p2 = (n) => String(n).padStart(2, "0");
    const p3 = (n) => String(n).padStart(3, "0");
    if (h > 0) return `${p2(h)}:${p2(m)}:${p2(s)}.${p3(msPart)}`;
    return `${p2(m)}:${p2(s)}.${p3(msPart)}`;
}

function formatSectorTime(msPart, minutesPart) {
    if (msPart === 0 && minutesPart === 0) return "--";
    const totalMs = minutesPart * 60000 + msPart;
    return formatTime(totalMs);
}

// Damage fill colour: interpolates yellow (--yellow #ffd700) at low damage →
// red (--danger #e10600) at high damage. The blend passes through orange near
// the middle, so the colour smoothly encodes severity instead of stepping.
function damageColor(pct) {
    const t = Math.max(0, Math.min(100, Number(pct) || 0)) / 100;
    const r = Math.round(255 + (225 - 255) * t);
    const g = Math.round(215 + (6 - 215) * t);
    return `rgb(${r}, ${g}, 0)`;
}

function setDamageBar(elId, pct) {
    const bar = el(elId);
    if (!bar) return;
    bar.style.width = pct + "%";
    bar.style.background = damageColor(pct);
    const valEl = el(elId + "Val");
    if (valEl) valEl.textContent = pct > 0 ? Math.round(pct) + "%" : "--";
}

function getTempTrend(current, history) {
    if (history.length < 2) return { arrow: "", cls: "", delta: 0 };
    const oldest = history[0];
    const delta = current - oldest;
    if (delta > 0) return { arrow: "▲", cls: "temp-trend-up", delta };
    if (delta < 0) return { arrow: "▼", cls: "temp-trend-down", delta };
    return { arrow: "—", cls: "temp-trend-stable", delta: 0 };
}

function pushTempHistory(history, value) {
    history.push(value);
    if (history.length > TEMP_HISTORY_MAX) history.shift();
}

function renderTempWithTrend(elemId, temp, trend) {
    const e = el(elemId);
    if (!e) return;
    const cls = trend.cls || "temp-trend-stable";
    let deltaHtml = "";
    if (trend.cls) {
        const deltaText = trend.delta > 0 ? `+${trend.delta}°` : trend.delta < 0 ? `${trend.delta}°` : "±0°";
        const arrow = trend.arrow ? `${trend.arrow} ` : "";
        deltaHtml = `<span class="temp-delta ${cls}">${arrow}${deltaText}</span>`;
    }
    e.innerHTML = `<span class="temp-num ${cls}">${temp}°C</span>${deltaHtml}`;
}

function resetTopSpeedSessionState() {
    sessionTopSpeedByCar.fill(0);
    playerLapPeakSpeed = 0;
    playerLastLapPeakSpeed = 0;
    playerLapPeakForLapNum = 0;
    updateTopSpeedWidgets();
}

function updateSession(data) {
    lastSessionPacket = data;

    // Selects DRS vs Straight-Mode (SM) presentation in the Car Telemetry widget.
    if (data.formula !== undefined && data.formula !== null) {
        currentFormula = data.formula;
        updateDrsSmTile();
    }

    const linkId = data.sessionLinkIdentifier;
    if (linkId !== undefined && linkId !== null) {
        if (lastSessionLinkId !== null && linkId !== lastSessionLinkId) {
            playerMaxRpm = 0;
            playerVisualTyreCompound = -1;
            playerActualTyreCompound = -1;
            lastPlayerCarTelemetry = null;
            pedalHistoryT.length = 0;
            pedalHistoryB.length = 0;
            gapRingObservedMaxLapDist = 0;
            resetPitStopHistory();
        }
        lastSessionLinkId = linkId;
    }

    setText("trackName", TRACK_NAMES[data.trackId] || `Track ${data.trackId}`);
    const flagEl = el("trackFlag");
    if (flagEl) {
        const cc = TRACK_FLAG_MAP[data.trackId];
        if (cc) {
            flagEl.src = `/assets/flags/${cc}.svg`;
            flagEl.alt = cc;
            flagEl.hidden = false;
        } else {
            flagEl.hidden = true;
        }
    }
    setText("sessionType", SESSION_TYPES[data.sessionType] || `Type ${data.sessionType}`);
    setText("weather", WEATHER_NAMES[data.weather] || "Unknown");

    if (data.trackId !== currentTrackId) {
        currentTrackId = data.trackId;
    }

    if (typeof onSessionTypeChanged === "function") {
        onSessionTypeChanged(data.sessionType);
    }

    const trackTemp = data.trackTemperature;
    const airTemp = data.airTemperature;

    if (prevTrackTemp !== null && trackTemp !== prevTrackTemp) {
        pushTempHistory(trackTempHistory, prevTrackTemp);
    }
    if (prevAirTemp !== null && airTemp !== prevAirTemp) {
        pushTempHistory(airTempHistory, prevAirTemp);
    }
    prevTrackTemp = trackTemp;
    prevAirTemp = airTemp;

    pushTempHistory(trackTempHistory, trackTemp);
    pushTempHistory(airTempHistory, airTemp);

    renderTempWithTrend("trackTemp", trackTemp, getTempTrend(trackTemp, trackTempHistory));
    renderTempWithTrend("airTemp", airTemp, getTempTrend(airTemp, airTempHistory));

    const pitLimit = data.pitSpeedLimit;
    setText("pitLimit", pitLimit > 0 ? `${pitLimit} km/h` : "--");

    const aiLevel = data.aiDifficulty;
    setText("aiLevel", aiLevel > 0 ? `${aiLevel}` : "--");

    const eq = data.equalCarPerformance;
    setText("equalCars", eq === 0 ? "Off" : eq === 1 ? "On" : "--");

    updateWeatherForecast(data);

    updateFlagIndicator();
    updateSessionProgress();
    scheduleRafUpdate("lapTimes", updateLapTimesWidget);
}

function updateFlagIndicator() {
    const indicator = el("flagIndicator");
    if (!indicator) return;

    const data = lastSessionPacket;
    if (!data) {
        indicator.textContent = "--";
        indicator.dataset.flag = "none";
        indicator.dataset.pulse = "0";
        return;
    }

    const sc = data.safetyCarStatus;
    const zones = data.marshalZones || [];
    const numZones = data.numMarshalZones || 0;

    let hasRed = false, hasYellow = false, hasBlue = false, hasGreen = false;
    for (let i = 0; i < numZones && i < zones.length; i++) {
        const f = zones[i]?.zoneFlag;
        if (f === 4) hasRed = true;
        else if (f === 3) hasYellow = true;
        else if (f === 2) hasBlue = true;
        else if (f === 1) hasGreen = true;
    }

    let label = "--", color = "none";
    if (hasRed) { label = "RED"; color = "red"; }
    else if (sc === 1) { label = "SC"; color = "yellow"; }
    else if (sc === 2) { label = "VSC"; color = "yellow"; }
    else if (hasYellow) { label = "YELLOW"; color = "yellow"; }
    else if (sc === 3) { label = "FORMATION"; color = "green"; }
    else if (hasBlue) { label = "BLUE"; color = "blue"; }
    else if (hasGreen) { label = "GREEN"; color = "green"; }

    indicator.textContent = label;
    indicator.dataset.flag = color;
    // Pulse for safety-car (yellow) and red-flag states to draw attention.
    indicator.dataset.pulse = (color === "yellow" || color === "red") ? "1" : "0";
}

function setSessionProgressBar(pct) {
    const bar = el("sessionProgressBar");
    if (!bar) return;
    const track = bar.parentElement;
    if (pct === null) {
        if (track) track.hidden = true;
        bar.style.width = "0";
        return;
    }
    if (track) track.hidden = false;
    bar.style.width = Math.max(0, Math.min(100, pct)) + "%";
}

function updateSessionProgress() {
    const labelEl = el("sessionProgressLabel");
    const valueEl = el("sessionProgressValue");
    if (!labelEl || !valueEl) return;

    const sType = lastSessionPacket?.sessionType ?? 0;
    const isRaceSession = sType === 15 || sType === 16 || sType === 17;

    if (isRaceSession) {
        const lap = lastLapDataPacket?.lapDataItems?.[playerCarIndex]?.currentLapNum ?? 0;
        const totalLaps = lastSessionPacket?.totalLaps ?? 0;
        labelEl.textContent = "Laps";
        if (lap > 0 && totalLaps > 0) {
            valueEl.textContent = `${lap}/${totalLaps}`;
            setSessionProgressBar((Math.min(lap, totalLaps) / totalLaps) * 100);
        } else {
            valueEl.textContent = "--";
            setSessionProgressBar(null);
        }
    } else {
        const timeLeftSec = lastSessionPacket?.sessionTimeLeft ?? 0;
        const durationSec = lastSessionPacket?.sessionDuration ?? 0;
        labelEl.textContent = "Time";
        if (timeLeftSec > 0) {
            const m = Math.floor(timeLeftSec / 60);
            const s = timeLeftSec % 60;
            valueEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
            setSessionProgressBar(durationSec > 0 ? ((durationSec - timeLeftSec) / durationSec) * 100 : null);
        } else {
            valueEl.textContent = "--";
            setSessionProgressBar(null);
        }
    }
}

const WEATHER_ICONS = {
    0: "☀️", 1: "🌤️", 2: "☁️", 3: "🌧️", 4: "🌧️", 5: "⛈️"
};
const WEATHER_LABELS = {
    0: "Clear", 1: "Light Cloud", 2: "Overcast", 3: "Light Rain", 4: "Heavy Rain", 5: "Storm"
};
const TEMP_CHANGE_ARROW = { 0: "▲", 1: "▼", 2: "" };
const TEMP_CHANGE_CLS = { 0: "wf-up", 1: "wf-down", 2: "" };

function updateWeatherForecast(data) {
    const container = document.getElementById("weatherForecastContent");
    if (!container) return;

    const count = data.numWeatherForecastSamples || 0;
    const samples = data.weatherForecastSamples;
    if (!samples || count === 0) {
        container.innerHTML = '<div class="widget-empty"><div class="widget-empty-icon"><span class="widget-empty-dash"></span></div><div class="widget-empty-title">No forecast data available</div><div class="widget-empty-sub">Waiting for session data</div></div>';
        return;
    }

    const currentSessionType = data.sessionType;
    const relevant = [];
    for (let i = 0; i < count && i < samples.length; i++) {
        const s = samples[i];
        if (s.sessionType === currentSessionType || s.sessionType === 0) {
            relevant.push(s);
        }
    }

    if (relevant.length === 0) {
        container.innerHTML = '<div class="widget-empty"><div class="widget-empty-icon"><span class="widget-empty-dash"></span></div><div class="widget-empty-title">No forecast for current session</div><div class="widget-empty-sub">Waiting for session data</div></div>';
        return;
    }

    const accuracy = data.forecastAccuracy === 0 ? "Perfect" : "Approximate";

    let html = `<div class="wf-accuracy">Accuracy: <span class="wf-accuracy-val">${accuracy}</span></div>`;
    html += '<div class="wf-timeline">';

    for (const s of relevant) {
        const icon = WEATHER_ICONS[s.weather] || "❓";
        const label = WEATHER_LABELS[s.weather] || "Unknown";
        const time = s.timeOffset === 0 ? "Now" : `+${s.timeOffset}m`;
        const rain = s.rainPercentage;
        const trackT = s.trackTemperature;
        const airT = s.airTemperature;
        const trackArr = TEMP_CHANGE_ARROW[s.trackTemperatureChange] || "";
        const trackCls = TEMP_CHANGE_CLS[s.trackTemperatureChange] || "";
        const airArr = TEMP_CHANGE_ARROW[s.airTemperatureChange] || "";
        const airCls = TEMP_CHANGE_CLS[s.airTemperatureChange] || "";

        const rainCls = rain >= 60 ? "wf-rain-high" : rain >= 30 ? "wf-rain-med" : "wf-rain-low";

        html += `<div class="wf-card">
            <div class="wf-time">${time}</div>
            <div class="wf-icon">${icon}</div>
            <div class="wf-label">${label}</div>
            <div class="wf-rain ${rainCls}">${rain}%</div>
            <div class="wf-temps">
                <span class="wf-temp-row">T ${trackT}° <span class="${trackCls}">${trackArr}</span></span>
                <span class="wf-temp-row">A ${airT}° <span class="${airCls}">${airArr}</span></span>
            </div>
        </div>`;
    }

    html += '</div>';
    container.innerHTML = html;
}

function initPedalChartGrid() {
    const g = el("pedalChartGrid");
    if (!g || g.dataset.inited) return;
    g.dataset.inited = "1";
    const verticals = 5;
    let inner = "";
    for (let i = 1; i <= verticals; i++) {
        const x = (i / (verticals + 1)) * 100;
        inner += `<line x1="${x}" y1="0" x2="${x}" y2="40" />`;
    }
    g.innerHTML = inner;
}

function pushPedalSample(throttle, brake) {
    pedalHistoryT.push(throttle);
    pedalHistoryB.push(brake);
    if (pedalHistoryT.length > PEDAL_HISTORY_LEN) pedalHistoryT.shift();
    if (pedalHistoryB.length > PEDAL_HISTORY_LEN) pedalHistoryB.shift();
}

function buildPedalPolylinePoints(values) {
    const n = values.length;
    if (n === 0) return "";
    const parts = [];
    for (let i = 0; i < n; i++) {
        const x = n === 1 ? 100 : (i / (n - 1)) * 100;
        const y = 40 - values[i] * 40;
        parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
    }
    return parts.join(" ");
}

function updatePedalChart() {
    const lineT = el("pedalLineThrottle");
    const lineB = el("pedalLineBrake");
    if (!lineT || !lineB) return;
    initPedalChartGrid();
    lineT.setAttribute("points", buildPedalPolylinePoints(pedalHistoryT));
    lineB.setAttribute("points", buildPedalPolylinePoints(pedalHistoryB));
}

/** DRS / Straight-Mode tile in the Car Telemetry widget.
 *  F1 26 (m_formula 13) drops DRS for Active Aero, so the tile shows "SM" (Straight Mode)
 *  driven by CarTelemetry26's activeAeroMode. Every other formula — including F2, which keeps
 *  DRS in the 2026 game — renders "DRS" from the player's CarTelemetry25 drs flag, as before. */
function updateDrsSmTile() {
    const drsEl = el("drsIndicator");
    if (!drsEl) return;
    if (currentFormula === FORMULA_F1_26) {
        drsEl.textContent = "SM";
        drsEl.title = "Straight Mode (Active Aero)";
        drsEl.classList.add("drs-sm");
        drsEl.classList.toggle("active", playerStraightModeActive);
    } else {
        drsEl.textContent = "DRS";
        drsEl.title = "DRS";
        drsEl.classList.remove("drs-sm");
        drsEl.classList.toggle("active", lastPlayerCarTelemetry?.drs === 1);
    }
}

function updateCarTelemetry25(data) {
    // Property name follows the renamed C# DTO (CarTelemetry25Packet.CarTelemetry25Data[]).
    // Older logs serialised as carTelemetryData; fall back so historical sessions still display.
    const cars = data.carTelemetry25Data || data.carTelemetryData;
    if (cars && cars.length) {
        for (let i = 0; i < cars.length && i < sessionTopSpeedByCar.length; i++) {
            const sp = Number(cars[i]?.speed) || 0;
            if (sp > sessionTopSpeedByCar[i]) sessionTopSpeedByCar[i] = sp;
        }
        const playerCar = cars[playerCarIndex];
        if (playerCar) {
            const lapNum = lastLapDataPacket?.lapDataItems?.[playerCarIndex]?.currentLapNum;
            const ln = lapNum !== undefined && lapNum !== null ? lapNum : 0;
            if (ln !== playerLapPeakForLapNum) {
                if (playerLapPeakSpeed > 0) playerLastLapPeakSpeed = playerLapPeakSpeed;
                playerLapPeakForLapNum = ln;
                playerLapPeakSpeed = 0;
            }
            const psp = Number(playerCar.speed) || 0;
            if (psp > playerLapPeakSpeed) playerLapPeakSpeed = psp;
        }
        updateTopSpeedWidgets();
    }

    const carList = data.carTelemetry25Data || data.carTelemetryData;
    const car = carList?.[playerCarIndex];
    if (!car) return;

    setText("speed", car.speed);
    const gear = car.gear;
    setText("gear", gear === -1 ? "R" : gear === 0 ? "N" : gear.toString());

    const scale = playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK;
    const rpmPct = Math.min(100, (car.engineRpm / scale) * 100);
    const rpmClip = el("rpmBarClip");
    if (rpmClip) rpmClip.style.setProperty("--rpm-pct", `${rpmPct}%`);
    setText("rpmValue", `${car.engineRpm} / ${scale} RPM`);

    if (scale !== _lastRpmScale) {
        _lastRpmScale = scale;
        syncRpmBarSegmentWidths(scale);
    }

    const t = Math.max(0, Math.min(1, Number(car.throttle) || 0));
    const b = Math.max(0, Math.min(1, Number(car.brake) || 0));
    const throttlePct = Math.round(t * 100);
    const brakePct = Math.round(b * 100);

    const throttleFill = el("throttleBar");
    const brakeFill = el("brakeBar");
    if (throttleFill) throttleFill.style.height = throttlePct + "%";
    if (brakeFill) brakeFill.style.height = brakePct + "%";

    const throttleLbl = el("throttlePct");
    const brakeLbl = el("brakePct");
    if (throttleLbl) throttleLbl.textContent = throttlePct + "%";
    if (brakeLbl) brakeLbl.textContent = brakePct + "%";

    pushPedalSample(t, b);
    if (!_pedalChartRafId) {
        _pedalChartRafId = requestAnimationFrame(() => { _pedalChartRafId = 0; updatePedalChart(); });
    }

    lastPlayerCarTelemetry = car;
    updateDrsSmTile();

    // Tyre temps: RL, RR, FL, FR (see F1 UDP appendix); inner temp fallback if surface is 0
    setTyreWidgetTemps(car);
}

function updateCarStatus(data) {
    if (data.carStatusDataItems) lastCarStatusItems = data.carStatusDataItems;
    const car = data.carStatusDataItems?.[playerCarIndex];
    if (!car) return;

    if (car.maxRpm > 0) {
        playerMaxRpm = car.maxRpm;
    }

    syncRpmBarSegmentWidths(playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK);

    const prevVisual = playerVisualTyreCompound;
    const prevActual = playerActualTyreCompound;
    if (car.visualTyreCompound != null) playerVisualTyreCompound = car.visualTyreCompound;
    if (car.actualTyreCompound != null) playerActualTyreCompound = car.actualTyreCompound;
    if ((prevVisual !== playerVisualTyreCompound || prevActual !== playerActualTyreCompound) && lastPlayerCarTelemetry) {
        setTyreWidgetTemps(lastPlayerCarTelemetry);
    }

    const pitTile = el("pitLimiterTile");
    if (pitTile) {
        if (car.pitLimiterStatus === 1) pitTile.classList.add("active");
        else pitTile.classList.remove("active");
    }

    const bbEl = el("frontBrakeBiasValue");
    if (bbEl) {
        bbEl.textContent =
            car.frontBrakeBias !== undefined && car.frontBrakeBias !== null
                ? `${car.frontBrakeBias}%`
                : "--";
    }

    updateFuelErsWidget(car);

    setTyreWidgetCompoundAge(car);
}

const FUEL_MIX_BADGE  = { 0: "LEAN", 1: "STD", 2: "RICH", 3: "MAX" };
// Deploy modes 0..2 are shared; mode 3 is named per regulation (OVERTAKE / BOOST).
const ERS_MODE_NAME   = { 0: "NONE", 1: "MEDIUM", 2: "HOTLAP" };
const MAX_ERS_J = 4_000_000;
const MAX_MGUK_HARVEST_J = 2_000_000;

// Per-regulation ERS model, selected by m_formula (Session packet). The packet
// carries no store/deploy capacity, so caps the game does not provide are held
// here as documented constants; F1 26's harvest budget comes straight from
// m_ersHarvestLimitPerLap, and its deploy/lap auto-scales to the session peak.
const FUEL_ERS_REG_CFG = {
    "2026": { storeCapJ: MAX_ERS_J, deployCapJ: null /* auto-peak */, overName: "BOOST",    harvest: "combined", hasErs: true },
    "2025": { storeCapJ: MAX_ERS_J, deployCapJ: MAX_ERS_J,            overName: "OVERTAKE", harvest: "split",    hasErs: true },
    "f2":   { hasErs: false },
};

// F1 26 deploy/lap has no documented cap, so we scale the bar to the largest
// deploy seen this session (floored at 4 MJ). Reset on session change.
let ersDeployPeakJ = 0;

const clampPct = (v) => Math.max(0, Math.min(100, v));
const toMJ = (j) => (Math.max(0, Number(j) || 0) / 1_000_000).toFixed(2);

function fuelErsRegKey(formula) {
    if (formula === FORMULA_F1_26) return "2026";
    if (formula === FORMULA_F2) return "f2";
    return "2025";
}

/** Plain-language fuel verdict from the signed MFD laps-vs-target delta. */
function fuelVerdict(delta) {
    const a = Math.abs(delta);
    if (a < 0.05) return "On target";
    const laps = a.toFixed(1);
    const unit = laps === "1.0" ? "lap" : "laps";
    return delta > 0 ? `${laps} ${unit} in hand` : `${laps} ${unit} short — lift & coast`;
}

function setHarvestBar(pct) {
    const bar = el("csErsHarvestBar");
    if (!bar) return;
    bar.style.width = pct + "%";
    // Threshold cues let the strategist see "running out of harvest headroom" at a glance.
    bar.classList.toggle("cs-bar-warn", pct >= 85 && pct < 95);
    bar.classList.toggle("cs-bar-crit", pct >= 95);
}

function updateFuelErsWidget(car) {
    if (!car) return;

    const regKey = fuelErsRegKey(currentFormula);
    const cfg = FUEL_ERS_REG_CFG[regKey];
    const card = el("csCard");
    if (card) card.dataset.reg = regKey;

    // ---- FUEL ----
    const mixEl = el("csFuelMix");
    if (mixEl) {
        mixEl.textContent = FUEL_MIX_BADGE[car.fuelMix] || "--";
        mixEl.dataset.mix = String(car.fuelMix ?? 0);
    }

    const fuelInTank = Number(car.fuelInTank) || 0;
    const fuelRemLaps = Number(car.fuelRemainingLaps) || 0;
    setText("csFuelTank", fuelInTank.toFixed(1) + " kg");

    const sType = lastSessionPacket?.sessionType ?? 0;
    const isRace = sType === 15 || sType === 16 || sType === 17;
    // m_fuelRemainingLaps is the MFD value: a signed delta of laps of fuel
    // surplus (+) or deficit (-) relative to finishing the race.
    const showDelta = isRace && Number.isFinite(fuelRemLaps);
    const deltaBox = el("csFuelDeltaBox");
    if (deltaBox) deltaBox.hidden = !showDelta;
    if (showDelta) {
        const delta = fuelRemLaps;
        const cls = delta < -0.3 ? "cs-delta-crit" : delta < 0 ? "cs-delta-warn" : "cs-delta-up";
        const deltaEl = el("csFuelDelta");
        if (deltaEl) {
            deltaEl.textContent = (delta >= 0 ? "+" : "−") + Math.abs(delta).toFixed(2);
            deltaEl.className = "cs-big-value " + cls;
        }
        const verdictEl = el("csFuelVerdict");
        if (verdictEl) {
            verdictEl.textContent = fuelVerdict(delta);
            verdictEl.className = "cs-verdict " + cls;
        }
    }

    // ---- ERS ---- (F2 has no ERS: hide the whole section)
    const ersSection = el("csErsSection");
    if (!cfg.hasErs) {
        if (ersSection) ersSection.hidden = true;
        return;
    }
    if (ersSection) ersSection.hidden = false;

    const mode = car.ersDeployMode ?? 0;
    const ersModeEl = el("csErsMode");
    if (ersModeEl) {
        ersModeEl.textContent = mode === 3 ? cfg.overName : (ERS_MODE_NAME[mode] || "--");
        ersModeEl.dataset.mode = String(mode);
    }
    // Deploy-mode chip (BOOST / OVERTAKE) shown only while that mode is active.
    const deployChip = el("csErsDeployChip");
    if (deployChip) {
        if (mode === 3) {
            deployChip.textContent = cfg.overName;
            deployChip.hidden = false;
        } else {
            deployChip.hidden = true;
        }
    }

    // Store — fixed 4 MJ battery on both F1 regulations.
    const storeJ = Math.max(0, Number(car.ersStoreEnergy) || 0);
    const storePct = clampPct((storeJ / cfg.storeCapJ) * 100);
    const storeBar = el("csErsStoreBar");
    if (storeBar) storeBar.style.width = storePct + "%";
    setText("csErsStoreVal", storePct.toFixed(0) + "% · " + toMJ(storeJ) + " MJ");

    // Deploy / lap — fixed 4 MJ on F1 25; auto-peak on F1 26.
    const deployJ = Math.max(0, Number(car.ersDeployedThisLap) || 0);
    let deployCapJ = cfg.deployCapJ;
    if (deployCapJ == null) {
        ersDeployPeakJ = Math.max(ersDeployPeakJ, deployJ, MAX_ERS_J);
        deployCapJ = ersDeployPeakJ;
    }
    const deployPct = clampPct((deployJ / deployCapJ) * 100);
    const deployBar = el("csErsDeployBar");
    if (deployBar) deployBar.style.width = deployPct + "%";
    setText("csErsDeployVal", toMJ(deployJ) + " / " + toMJ(deployCapJ) + " MJ");

    // Harvest / lap. F1 26: single per-lap budget from m_ersHarvestLimitPerLap
    // (MGU-H removed by the 2026 regs, so K is the whole harvest). F1 25: MGU-K
    // capped at 2 MJ/lap with MGU-H shown as an uncapped bonus.
    const harvKJ = Math.max(0, Number(car.ersHarvestedThisLapMguK) || 0);
    const harvHJ = Math.max(0, Number(car.ersHarvestedThisLapMguH) || 0);
    const harvestNoteEl = el("csErsHarvestNote");
    if (cfg.harvest === "combined") {
        const limitJ = Math.max(0, Number(car.ersHarvestLimitPerLap) || 0) || cfg.storeCapJ;
        const harvestJ = harvKJ + harvHJ;
        const pct = clampPct(limitJ > 0 ? (harvestJ / limitJ) * 100 : 0);
        setText("csErsHarvestLabel", "Harvest / lap");
        setText("csErsHarvestVal", toMJ(harvestJ) + " / " + toMJ(limitJ) + " MJ");
        if (harvestNoteEl) {
            const remainMJ = Math.max(0, (limitJ - harvestJ) / 1_000_000);
            harvestNoteEl.textContent = remainMJ.toFixed(1) + " MJ left";
            harvestNoteEl.classList.toggle("cs-note-warn", pct >= 92);
        }
        setHarvestBar(pct);
    } else {
        const pct = clampPct((harvKJ / MAX_MGUK_HARVEST_J) * 100);
        setText("csErsHarvestLabel", "Harvest / lap (MGU-K)");
        setText("csErsHarvestVal", toMJ(harvKJ) + " / " + toMJ(MAX_MGUK_HARVEST_J) + " MJ");
        if (harvestNoteEl) {
            harvestNoteEl.textContent = "+" + toMJ(harvHJ) + " MGU-H";
            harvestNoteEl.classList.remove("cs-note-warn");
        }
        setHarvestBar(pct);
    }
}

function updateCarSetups(data) {
    lastCarSetupsPacket = data;
    const setup = data.carSetupData?.[playerCarIndex];
    const diffEl = el("diffOnThrottleValue");
    if (diffEl) {
        if (!setup || setup.onThrottle === undefined || setup.onThrottle === null) {
            diffEl.textContent = "--";
        } else {
            diffEl.textContent = `${setup.onThrottle}%`;
        }
    }
    scheduleRafUpdate("lapTimes", updateLapTimesWidget);
}

function updateLapData(data) {
    lastLapDataPacket = data;

    updateSessionProgress();
    scheduleRafUpdate("standings", () => updateStandings(lastLapDataPacket));
    scheduleRafUpdate("qualiStandings", updateQualiStandings);
    scheduleRafUpdate("pitPredictor", updatePitPredictor);
    scheduleRafUpdate("gapBoard", updateGapBoard);
    scheduleRafUpdate("gapRing", updateGapRing);

    const car = data.lapDataItems?.[playerCarIndex];
    if (!car) return;

    const ln = car.currentLapNum;
    if (ln !== undefined && ln !== null && ln !== playerLapPeakForLapNum) {
        if (playerLapPeakSpeed > 0) playerLastLapPeakSpeed = playerLapPeakSpeed;
        playerLapPeakForLapNum = ln;
        playerLapPeakSpeed = 0;
        updateTopSpeedWidgets();
    }

    updatePitStopTimer(car);
    updateLapDataWidget(car);
}

const LAP_DATA_REF_KEY = "f1telemetry_lap_data_ref_v1";
const LD_RECENT_LAPS = 5;
let lapDataRef = (localStorage.getItem(LAP_DATA_REF_KEY) === "best") ? "best" : "previous";
let _lapDataLegendPanel = null;

function initLapDataWidget() {
    const btn = document.getElementById("btnLapDataRef");
    if (btn && btn.dataset.ldWired !== "1") {
        btn.dataset.ldWired = "1";
        updateLapDataRefButton();
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            lapDataRef = lapDataRef === "previous" ? "best" : "previous";
            localStorage.setItem(LAP_DATA_REF_KEY, lapDataRef);
            updateLapDataRefButton();
            const car = lastLapDataPacket?.lapDataItems?.[playerCarIndex];
            if (car) updateLapDataWidget(car);
        });
    }
    const legendBtn = document.getElementById("btnLapDataLegend");
    if (legendBtn && legendBtn.dataset.ldWired !== "1") {
        legendBtn.dataset.ldWired = "1";
        legendBtn.addEventListener("mouseenter", () => openLapDataLegend(legendBtn));
        legendBtn.addEventListener("mouseleave", closeLapDataLegend);
        legendBtn.addEventListener("focus", () => openLapDataLegend(legendBtn));
        legendBtn.addEventListener("blur", closeLapDataLegend);
    }
    updateLapDataRefButton();
}

function updateLapDataRefButton() {
    const lbl = document.getElementById("ldRefLabel");
    if (lbl) lbl.textContent = lapDataRef === "best" ? "vs Best" : "vs Prev";
}

function openLapDataLegend(anchor) {
    closeLapDataLegend();
    const panel = document.createElement("div");
    panel.className = "tyre-info-panel";
    panel.innerHTML =
        '<div class="tip-section"><div class="tip-title">Split colors</div>' +
        '<div class="tip-row"><span class="ld-swatch ld-pb"></span><span>Personal best</span></div>' +
        '<div class="tip-row"><span class="ld-swatch ld-up"></span><span>Faster than reference</span></div>' +
        '<div class="tip-row"><span class="ld-swatch ld-down"></span><span>Slower than reference</span></div>' +
        '<div class="tip-row"><span class="ld-swatch ld-active"></span><span>Current sector</span></div></div>' +
        '<div class="tip-section"><div class="tip-title">Reference</div>' +
        '<div class="tip-desc">Toggle Previous Lap ↔ Personal Best via the button next to the legend.</div></div>' +
        '<div class="tip-section"><div class="tip-title">Invalid lap</div>' +
        '<div class="tip-desc">Invalid laps (m_currentLapInvalid) are excluded from personal bests.</div></div>';
    document.body.appendChild(panel);
    _lapDataLegendPanel = panel;
    const r = anchor.getBoundingClientRect();
    const pw = panel.offsetWidth;
    let left = r.right - pw;
    if (left < 4) left = 4;
    if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
    panel.style.left = left + "px";
    panel.style.top = (r.bottom + 6) + "px";
}

function closeLapDataLegend() {
    if (_lapDataLegendPanel) {
        _lapDataLegendPanel.remove();
        _lapDataLegendPanel = null;
    }
}

function formatLdDelta(deltaMs) {
    if (deltaMs == null || !Number.isFinite(deltaMs)) return "";
    const sign = deltaMs >= 0 ? "+" : "−";
    const abs = Math.abs(deltaMs) / 1000;
    return sign + abs.toFixed(3);
}

function ldDeltaClass(deltaMs) {
    if (deltaMs == null || !Number.isFinite(deltaMs)) return "";
    if (deltaMs < 0) return "ld-delta-up";
    if (deltaMs > 0) return "ld-delta-down";
    return "ld-delta-neutral";
}

function ldSectorClass(currentMs, refMs, pbMs, isPB) {
    if (!currentMs) return "ld-none";
    if (isPB) return "ld-pb";
    if (refMs && currentMs < refMs) return "ld-up";
    if (refMs && currentMs > refMs) return "ld-down";
    return "";
}

function ldLapValid(bitFlags) { return (bitFlags & 1) === 1; }

function ldGetSectorBest(hist, sector) {
    if (!hist || !hist.lapHistoryDataItems) return 0;
    const lapNum = sector === 1 ? hist.bestSector1LapNum
                 : sector === 2 ? hist.bestSector2LapNum
                 : hist.bestSector3LapNum;
    if (!lapNum) return 0;
    const entry = hist.lapHistoryDataItems[lapNum - 1];
    if (!entry) return 0;
    return sectorMsFromHistoryEntry(entry, sector);
}

function ldGetBestLapMs(hist) {
    if (!hist || !hist.lapHistoryDataItems || !hist.bestLapTimeLapNum) return 0;
    const entry = hist.lapHistoryDataItems[hist.bestLapTimeLapNum - 1];
    return entry?.lapTimeInMs || 0;
}

function ldGetPrevLapEntry(hist, currentLapNum) {
    if (!hist || !hist.lapHistoryDataItems) return null;
    const idx = currentLapNum - 2;
    if (idx < 0 || idx >= hist.lapHistoryDataItems.length) return null;
    return hist.lapHistoryDataItems[idx];
}

function predictLapFinishMs(car, pbS1, pbS2, pbS3) {
    if (!car) return 0;
    const sector = car.sector;
    const elapsed = car.currentLapTimeInMs || 0;
    const s1Done = (car.sector1TimeMinutesPart || 0) * 60000 + (car.sector1TimeMsPart || 0);
    const s2Done = (car.sector2TimeMinutesPart || 0) * 60000 + (car.sector2TimeMsPart || 0);

    if (sector === 0) {
        if (!pbS1 || !pbS2 || !pbS3) return 0;
        return Math.max(pbS1, elapsed) + pbS2 + pbS3;
    }
    if (sector === 1) {
        if (!pbS2 || !pbS3) return 0;
        const elapsedS2 = Math.max(elapsed - s1Done, 0);
        return s1Done + Math.max(pbS2, elapsedS2) + pbS3;
    }
    if (sector === 2) {
        if (!pbS3) return 0;
        const done = s1Done + s2Done;
        const elapsedS3 = Math.max(elapsed - done, 0);
        return done + Math.max(pbS3, elapsedS3);
    }
    return 0;
}

function renderLdSector(num, currentMs, refMs, pbMs, lapValid) {
    const valEl = el("ldS" + num);
    const deltaEl = el("ldS" + num + "Delta");
    if (valEl) {
        valEl.textContent = currentMs > 0 ? formatLapClock(currentMs) : "--";
        const cls = ldSectorClass(
            currentMs,
            refMs,
            pbMs,
            lapValid && pbMs > 0 && currentMs === pbMs
        );
        valEl.className = "ld-sector-time " + cls;
    }
    if (deltaEl) {
        if (currentMs > 0 && refMs > 0) {
            const d = currentMs - refMs;
            deltaEl.textContent = formatLdDelta(d);
            deltaEl.className = "ld-delta " + ldDeltaClass(d);
        } else {
            deltaEl.textContent = "";
            deltaEl.className = "ld-delta";
        }
    }
}

function renderLdMiniStrips(hist, currentLapNum, pbLapMs, pbS1, pbS2, pbS3) {
    const lapEl = el("ldMiniLap");
    const s1El  = el("ldMiniS1");
    const s2El  = el("ldMiniS2");
    const s3El  = el("ldMiniS3");

    const clear = () => {
        if (lapEl) lapEl.innerHTML = "";
        if (s1El)  s1El.innerHTML  = "";
        if (s2El)  s2El.innerHTML  = "";
        if (s3El)  s3El.innerHTML  = "";
    };

    if (!hist || !hist.lapHistoryDataItems || currentLapNum < 2) {
        clear();
        return;
    }

    const completedUpTo = Math.min(currentLapNum - 1, hist.lapHistoryDataItems.length);
    const from = Math.max(0, completedUpTo - LD_RECENT_LAPS);

    let prevLap = 0, prevS1 = 0, prevS2 = 0, prevS3 = 0;
    if (from > 0) {
        const prevEntry = hist.lapHistoryDataItems[from - 1];
        if (prevEntry) {
            prevLap = prevEntry.lapTimeInMs || 0;
            prevS1 = sectorMsFromHistoryEntry(prevEntry, 1);
            prevS2 = sectorMsFromHistoryEntry(prevEntry, 2);
            prevS3 = sectorMsFromHistoryEntry(prevEntry, 3);
        }
    }

    let htmlLap = "", htmlS1 = "", htmlS2 = "", htmlS3 = "";
    for (let i = from; i < completedUpTo; i++) {
        const entry = hist.lapHistoryDataItems[i];
        if (!entry) continue;
        const lapNum = i + 1;
        const valid = ldLapValid(entry.lapValidBitFlags);
        const lapMs = entry.lapTimeInMs || 0;
        const s1 = sectorMsFromHistoryEntry(entry, 1);
        const s2 = sectorMsFromHistoryEntry(entry, 2);
        const s3 = sectorMsFromHistoryEntry(entry, 3);

        const refLap = lapDataRef === "best" ? pbLapMs : prevLap;
        const refS1  = lapDataRef === "best" ? pbS1    : prevS1;
        const refS2  = lapDataRef === "best" ? pbS2    : prevS2;
        const refS3  = lapDataRef === "best" ? pbS3    : prevS3;

        const cLap = ldSectorClass(lapMs, refLap, pbLapMs, valid && pbLapMs > 0 && lapMs === pbLapMs);
        const cS1  = ldSectorClass(s1,    refS1,  pbS1,    valid && pbS1    > 0 && s1    === pbS1);
        const cS2  = ldSectorClass(s2,    refS2,  pbS2,    valid && pbS2    > 0 && s2    === pbS2);
        const cS3  = ldSectorClass(s3,    refS3,  pbS3,    valid && pbS3    > 0 && s3    === pbS3);

        const invCls = valid ? "" : " ld-mini-invalid";
        const title = `L${lapNum}`;
        htmlLap += `<span class="ld-mini-sq ${cLap}${invCls}" title="${title}"></span>`;
        htmlS1  += `<span class="ld-mini-sq ${cS1}${invCls}"  title="${title}"></span>`;
        htmlS2  += `<span class="ld-mini-sq ${cS2}${invCls}"  title="${title}"></span>`;
        htmlS3  += `<span class="ld-mini-sq ${cS3}${invCls}"  title="${title}"></span>`;

        prevLap = lapMs; prevS1 = s1; prevS2 = s2; prevS3 = s3;
    }

    if (lapEl) lapEl.innerHTML = htmlLap;
    if (s1El)  s1El.innerHTML  = htmlS1;
    if (s2El)  s2El.innerHTML  = htmlS2;
    if (s3El)  s3El.innerHTML  = htmlS3;
}

function updateLapDataWidget(car) {
    if (!car) return;
    const container = document.querySelector(".lap-data-card");
    if (!container) return;

    const hist = sessionHistories[playerCarIndex];
    const currentLapNum = car.currentLapNum || 0;

    const prev = ldGetPrevLapEntry(hist, currentLapNum);
    const prevS1 = prev ? sectorMsFromHistoryEntry(prev, 1) : 0;
    const prevS2 = prev ? sectorMsFromHistoryEntry(prev, 2) : 0;
    const prevS3 = prev ? sectorMsFromHistoryEntry(prev, 3) : 0;
    const prevLapMs = prev ? prev.lapTimeInMs : 0;

    const pbS1 = ldGetSectorBest(hist, 1);
    const pbS2 = ldGetSectorBest(hist, 2);
    const pbS3 = ldGetSectorBest(hist, 3);
    const pbLapMs = ldGetBestLapMs(hist);

    const refS1 = lapDataRef === "best" ? pbS1 : prevS1;
    const refS2 = lapDataRef === "best" ? pbS2 : prevS2;
    const refS3 = lapDataRef === "best" ? pbS3 : prevS3;
    const refLap = lapDataRef === "best" ? pbLapMs : prevLapMs;

    const lastLapMs = car.lastLapTimeInMs || prevLapMs;
    const lastLapEntry = prev;
    const lastS1 = lastLapEntry ? sectorMsFromHistoryEntry(lastLapEntry, 1) : 0;
    const lastS2 = lastLapEntry ? sectorMsFromHistoryEntry(lastLapEntry, 2) : 0;
    const lastS3 = lastLapEntry ? sectorMsFromHistoryEntry(lastLapEntry, 3) : 0;
    const lastLapValid = lastLapEntry ? ldLapValid(lastLapEntry.lapValidBitFlags) : true;

    const lastLapEl = el("ldLastLap");
    if (lastLapEl) {
        lastLapEl.textContent = lastLapMs > 0 ? formatLapClock(lastLapMs) : "--";
        lastLapEl.className = "ld-time ld-last-time " + ldSectorClass(
            lastLapMs,
            refLap,
            pbLapMs,
            lastLapValid && pbLapMs > 0 && lastLapMs === pbLapMs
        );
    }

    const lastLapDeltaEl = el("ldLastLapDelta");
    if (lastLapDeltaEl) {
        if (lastLapMs > 0 && refLap > 0) {
            const d = lastLapMs - refLap;
            lastLapDeltaEl.textContent = formatLdDelta(d);
            lastLapDeltaEl.className = "ld-delta " + ldDeltaClass(d);
        } else {
            lastLapDeltaEl.textContent = "";
            lastLapDeltaEl.className = "ld-delta";
        }
    }

    renderLdSector(1, lastS1, refS1, pbS1, lastLapValid);
    renderLdSector(2, lastS2, refS2, pbS2, lastLapValid);
    renderLdSector(3, lastS3, refS3, pbS3, lastLapValid);

    container.querySelectorAll(".ld-sector").forEach(s => s.classList.remove("ld-sector-active"));
    const curSector = car.sector;
    if (curSector >= 0 && curSector <= 2) {
        const activeEl = container.querySelector(`.ld-sector[data-ld-sector="${curSector + 1}"]`);
        if (activeEl) activeEl.classList.add("ld-sector-active");
    }

    setText("ldCurLap", formatLapClock(car.currentLapTimeInMs || 0));
    const invBadge = el("ldInvalidBadge");
    if (invBadge) invBadge.hidden = car.currentLapInvalid !== 1;

    const predictedEl = el("ldPredicted");
    if (predictedEl) {
        const p = predictLapFinishMs(car, pbS1, pbS2, pbS3);
        predictedEl.textContent = p > 0 ? formatLapClock(p) : "--";
    }

    renderLdMiniStrips(hist, currentLapNum, pbLapMs, pbS1, pbS2, pbS3);
}

const pitStopHistory = [];
let _pitLaneActivePrev = false;
let _pitLaneMaxLaneMs = 0;
let _pitLaneMaxStallMs = 0;
let _pitLaneEntryLap = 0;

function formatPitTimeMs(ms) {
    if (!ms || ms <= 0) return "--";
    return (ms / 1000).toFixed(2) + "s";
}

function resetPitStopHistory() {
    pitStopHistory.length = 0;
    _pitLaneActivePrev = false;
    _pitLaneMaxLaneMs = 0;
    _pitLaneMaxStallMs = 0;
    _pitLaneEntryLap = 0;
    const laneEl = el("pitTimerLaneNow");
    const stallEl = el("pitTimerStallNow");
    if (laneEl) laneEl.textContent = "--";
    if (stallEl) stallEl.textContent = "--";
    renderPitStopHistory();
}

function updatePitStopTimer(car) {
    if (!car) return;

    const active = car.pitLaneTimerActive === 1;
    const laneMs = car.pitLaneTimeInLaneInMs || 0;
    const stallMs = car.pitStopTimerInMs || 0;
    const lap = car.currentLapNum || 0;

    const laneEl = el("pitTimerLaneNow");
    const stallEl = el("pitTimerStallNow");

    if (active) {
        if (!_pitLaneActivePrev) _pitLaneEntryLap = lap;
        if (laneMs > _pitLaneMaxLaneMs) _pitLaneMaxLaneMs = laneMs;
        if (stallMs > _pitLaneMaxStallMs) _pitLaneMaxStallMs = stallMs;

        if (laneEl) laneEl.textContent = formatPitTimeMs(laneMs);
        if (stallEl) stallEl.textContent = formatPitTimeMs(stallMs);
    } else {
        if (_pitLaneActivePrev && (_pitLaneMaxLaneMs > 0 || _pitLaneMaxStallMs > 0)) {
            pitStopHistory.push({
                lap: _pitLaneEntryLap || lap,
                laneMs: _pitLaneMaxLaneMs,
                stallMs: _pitLaneMaxStallMs,
            });
            renderPitStopHistory();
        }
        _pitLaneMaxLaneMs = 0;
        _pitLaneMaxStallMs = 0;

        if (laneEl) laneEl.textContent = "--";
        if (stallEl) stallEl.textContent = "--";
    }

    _pitLaneActivePrev = active;
}

function renderPitStopHistory() {
    const body = el("pitTimerHistoryBody");
    if (!body) return;
    if (pitStopHistory.length === 0) {
        body.innerHTML = '<tr class="pit-timer-empty"><td colspan="4">No pit stops yet</td></tr>';
        return;
    }
    let html = "";
    pitStopHistory.forEach((r, i) => {
        html += `<tr><td>${i + 1}</td><td>${r.lap || "--"}</td><td>${formatPitTimeMs(r.laneMs)}</td><td>${formatPitTimeMs(r.stallMs)}</td></tr>`;
    });
    body.innerHTML = html;
}

function updateCarDamage(data) {
    lastCarDamagePacket = data;
    const car = data.carDamageDataItems?.[playerCarIndex];
    if (!car) return;

    setDamageBar("dmgFL", car.frontLeftWingDamage);
    setDamageBar("dmgFR", car.frontRightWingDamage);
    setDamageBar("dmgRear", car.rearWingDamage);
    setDamageBar("dmgFloor", car.floorDamage);
    setDamageBar("dmgEngine", car.engineDamage);
    setDamageBar("dmgGearbox", car.gearBoxDamage);

    setTyreWidgetWear(car);
}

function updateParticipants(data) {
    participantNames = [];
    participantTeamIds = [];
    participantLiveryColors = [];
    if (data.participants) {
        for (let i = 0; i < data.participants.length; i++) {
            const p = data.participants[i];
            participantNames[i] = p?.name || `Car ${i}`;
            participantTeamIds[i] = p?.teamId != null ? p.teamId : -1;
            participantLiveryColors[i] = extractLiveryColor(p);
        }
    }
    updateTopSpeedWidgets();
    scheduleRafUpdate("gapRing", updateGapRing);
    scheduleRafUpdate("lapTimes", updateLapTimesWidget);
}

function formatSpeedKmh(v) {
    if (!v || v <= 0) return "--";
    return Math.round(v).toString();
}

function applyTopSpeedLayoutMode(root, compact) {
    if (!root) return;
    root.classList.toggle("ts-compact", compact);
}

function refreshTopSpeedLayoutModes() {
    document.querySelectorAll("[data-ts-widget]").forEach(root => {
        const w = root.clientWidth;
        const isCompare = root.getAttribute("data-ts-widget") === "compare";
        // Compare widget: column vs row via CSS @container on .tsc-layout. Leaderboard stacks below 280px.
        const compact = !isCompare && w > 0 && w < 280;
        applyTopSpeedLayoutMode(root, compact);
    });
}

function ensureTopSpeedLayoutObserver() {
    if (typeof ResizeObserver === "undefined") return;
    if (!_topSpeedLayoutObserver) {
        _topSpeedLayoutObserver = new ResizeObserver(() => refreshTopSpeedLayoutModes());
    }
    document.querySelectorAll("[data-ts-widget]").forEach(root => {
        if (_topSpeedObservedRoots.has(root)) return;
        _topSpeedObservedRoots.add(root);
        _topSpeedLayoutObserver.observe(root);
    });
    refreshTopSpeedLayoutModes();
}

window.ensureTopSpeedLayoutObserver = ensureTopSpeedLayoutObserver;

function updateTopSpeedLeaderboard() {
    const body = el("topSpeedLeaderboardBody");
    if (!body) return;
    if (!lastLapDataPacket?.lapDataItems) {
        body.innerHTML = '<div class="ts-lb-placeholder">Waiting for lap data...</div>';
        return;
    }

    const items = lastLapDataPacket.lapDataItems;
    const rows = [];
    for (let i = 0; i < items.length && i < sessionTopSpeedByCar.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        const spd = sessionTopSpeedByCar[i];
        if (!spd) continue;
        rows.push({
            idx: i,
            pos: ld.carPosition,
            name: participantNames[i] || `Car ${i}`,
            speed: spd,
            isPlayer: i === playerCarIndex,
        });
    }

    if (rows.length === 0) {
        body.innerHTML = '<div class="ts-lb-placeholder">Waiting for telemetry...</div>';
        return;
    }

    rows.sort((a, b) => b.speed - a.speed || a.pos - b.pos);

    const parts = [];
    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowCls = r.isPlayer ? "ts-lb-row player-row" : "ts-lb-row";
        const safeName = escapeHtml(r.name);
        parts.push(`<div class="${rowCls}"><span class="ts-lb-rank">${i + 1}</span><span class="ts-lb-name" title="${safeName}">${safeName}</span><span class="ts-lb-speed">${formatSpeedKmh(r.speed)}</span></div>`);
    }
    body.innerHTML = parts.join("");
}

function updateTopSpeedCompareWidget() {
    const lastLapEl = el("topSpeedLastLapPeak");
    if (!lastLapEl) return;

    const sessionBest = sessionTopSpeedByCar[playerCarIndex] || 0;
    const lastLap = playerLastLapPeakSpeed;
    const thisLap = playerLapPeakSpeed;

    lastLapEl.textContent = lastLap > 0 ? formatSpeedKmh(lastLap) : "--";

    const sessionEl = el("topSpeedSessionBest");
    if (sessionEl) sessionEl.textContent = sessionBest > 0 ? formatSpeedKmh(sessionBest) : "--";

    const lapEl = el("topSpeedLapPeak");
    if (lapEl) lapEl.textContent = thisLap > 0 ? formatSpeedKmh(thisLap) : "--";

    const lastLapDeltaEl = el("topSpeedLastLapDelta");
    if (lastLapDeltaEl) {
        if (lastLap > 0 && sessionBest > 0) {
            const delta = Math.round(lastLap - sessionBest);
            if (delta === 0) {
                lastLapDeltaEl.textContent = "PB";
                lastLapDeltaEl.className = "tsc-delta tsc-delta-pb";
            } else {
                lastLapDeltaEl.textContent = delta.toString();
                lastLapDeltaEl.className = "tsc-delta tsc-delta-down";
            }
        } else {
            lastLapDeltaEl.textContent = "";
            lastLapDeltaEl.className = "tsc-delta";
        }
    }

    const thisLapDeltaEl = el("topSpeedThisLapDelta");
    if (thisLapDeltaEl) {
        let delta = null;
        if (thisLap > 0 && lastLap > 0) delta = Math.round(thisLap - lastLap);
        else if (thisLap > 0 && sessionBest > 0) delta = Math.round(thisLap - sessionBest);

        if (delta !== null) {
            const sign = delta >= 0 ? "+" : "";
            thisLapDeltaEl.textContent = sign + delta;
            thisLapDeltaEl.className = "tsc-delta " + (delta >= 0 ? "tsc-delta-up" : "tsc-delta-down");
        } else {
            thisLapDeltaEl.textContent = "";
            thisLapDeltaEl.className = "tsc-delta";
        }
    }
}

function updateTopSpeedWidgets() {
    updateTopSpeedLeaderboard();
    updateTopSpeedCompareWidget();
}

function buildPenaltyDetail(d) {
    const driver = participantNames[d.vehicleIdx] || `Car ${d.vehicleIdx}`;
    const penType = PENALTY_TYPES[d.penaltyType] || `Penalty #${d.penaltyType}`;
    const infType = INFRINGEMENT_TYPES[d.infringementType] || `Infr. #${d.infringementType}`;
    let text = `${driver}: ${penType}`;
    if (d.time > 0) text += ` (+${d.time}s)`;
    text += ` — ${infType}`;
    if (d.lapNum > 0) text += ` (Lap ${d.lapNum})`;
    return text;
}

function unpinServedPenalty(vehicleIdx, matchPenaltyType) {
    const idx = pinnedPenalties.findIndex(
        p => p.vehicleIdx === vehicleIdx && p.penaltyType === matchPenaltyType && !p.served
    );
    if (idx === -1) return;
    const penalty = pinnedPenalties[idx];
    penalty.served = true;
    pinnedPenalties.splice(idx, 1);
}

function updateEvent(data, header) {
    const code = data.eventCode;

    const name = EVENT_NAMES[code] || code;
    let detail = "";
    const isPenalty = PENALTY_CODES.has(code);
    let vehicleIdx = -1;
    let penaltyType = -1;

    if (data.details) {
        const d = data.details;

        if (code === "PENA") {
            detail = buildPenaltyDetail(d);
            vehicleIdx = d.vehicleIdx;
            penaltyType = d.penaltyType;
        } else if (code === "DTSV") {
            vehicleIdx = d.vehicleIdx;
            const driver = participantNames[d.vehicleIdx] || `Car ${d.vehicleIdx}`;
            detail = `${driver}: Drive Through served`;
            unpinServedPenalty(vehicleIdx, 0);
        } else if (code === "SGSV") {
            vehicleIdx = d.vehicleIdx;
            const driver = participantNames[d.vehicleIdx] || `Car ${d.vehicleIdx}`;
            detail = `${driver}: Stop-Go served (${d.stopTime?.toFixed(1) || 0}s)`;
            unpinServedPenalty(vehicleIdx, 1);
        } else if (code === "BUTN") {
            if (d.buttonStatus !== undefined) {
                detail = `0x${d.buttonStatus.toString(16).toUpperCase().padStart(8, "0")}`;
            }
        } else {
            if (d.vehicleIdx !== undefined) {
                detail = participantNames[d.vehicleIdx] || `Car ${d.vehicleIdx}`;
            }
            if (d.lapTime) detail += ` ${formatLapClock(d.lapTime * 1000)}`;
            if (d.speed) detail += ` ${d.speed.toFixed(1)} km/h`;
            if (d.overtakingVehicleIdx !== undefined && d.beingOvertakenVehicleIdx !== undefined) {
                const overtaker = participantNames[d.overtakingVehicleIdx] || `Car ${d.overtakingVehicleIdx}`;
                const overtaken = participantNames[d.beingOvertakenVehicleIdx] || `Car ${d.beingOvertakenVehicleIdx}`;
                detail = `${overtaker} → ${overtaken}`;
            }
            if (d.vehicle1Idx !== undefined && d.vehicle2Idx !== undefined) {
                const v1 = participantNames[d.vehicle1Idx] || `Car ${d.vehicle1Idx}`;
                const v2 = participantNames[d.vehicle2Idx] || `Car ${d.vehicle2Idx}`;
                detail = `${v1} ↔ ${v2}`;
            }
        }
    }

    const elapsed = header?.sessionTime ?? -1;
    const sType = lastSessionPacket?.sessionType ?? 0;
    const isRaceSession = sType === 15 || sType === 16 || sType === 17;
    const isTimeTrial = sType === 18;
    let timeCtx;
    if (isRaceSession || isTimeTrial) {
        const lap = lastLapDataPacket?.lapDataItems?.[playerCarIndex]?.currentLapNum ?? 0;
        timeCtx = { mode: "lap", lap };
    } else {
        timeCtx = { mode: "timed", elapsed };
    }
    const entry = { code, name, detail, timeCtx, isPenalty, vehicleIdx, penaltyType };

    if (code === "PENA" && PINNABLE_PENALTY_TYPES.has(penaltyType)) {
        pinnedPenalties.unshift(entry);
    }

    if (code === "DTSV" || code === "SGSV") {
        entry.served = true;
    }

    if (eventFilter[code] !== false) {
        events.unshift(entry);
        if (events.length > maxEvents) events.length = maxEvents;
    }

    /* Fast path: for non-penalty events, insert at top instead of full rebuild */
    const needsFullRender = isPenalty || code === "DTSV" || code === "SGSV" || eventFilter[code] === false;
    if (!needsFullRender) {
        const list = el("eventsList");
        if (list && events.length > 1) {
            const ph = list.querySelector(".placeholder");
            if (ph) ph.remove();
            list.insertAdjacentHTML("afterbegin", renderEventItem(entry, false));
            while (list.children.length > maxEvents) list.removeChild(list.lastChild);
            return;
        }
    }
    renderEvents();
}

function fmtMmSs(totalSecs) {
    const s = Math.max(0, Math.floor(totalSecs));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatEventTimeCtx(ctx) {
    if (!ctx) return "--";
    if (ctx.mode === "lap") {
        return ctx.lap > 0 ? `L${ctx.lap}` : "--";
    }
    if (ctx.elapsed == null || ctx.elapsed < 0) return "--";
    return fmtMmSs(ctx.elapsed);
}

function renderEventItem(e, pinned) {
    const isSeriousPenalty = e.code === "PENA" && PINNABLE_PENALTY_TYPES.has(e.penaltyType);

    let cls = "event-item";
    if (pinned) cls += " penalty-serious pinned";
    else if (isSeriousPenalty) cls += " penalty-serious";

    const codeColor = EVENT_CODE_COLORS[e.code] || "var(--accent-blue)";
    const icon = pinned ? '<span class="pin-icon">&#128204;</span> ' : "";
    const servedBadge = e.served ? ' <span class="served-badge">SERVED</span>' : "";
    const timeLabel = formatEventTimeCtx(e.timeCtx);
    return `<div class="${cls}">
        <span class="event-code" style="color:${codeColor}">${icon}${e.code}</span>
        <span class="event-detail">${escapeHtml(e.name)}${e.detail ? " — " + escapeHtml(e.detail) : ""}${servedBadge}</span>
        <span class="event-time">${timeLabel}</span>
    </div>`;
}

function renderEvents() {
    const list = el("eventsList");
    if (!list) return;

    if (events.length === 0 && pinnedPenalties.length === 0) {
        list.innerHTML = '<div class="event-item placeholder">Waiting for events...</div>';
        return;
    }

    let html = "";

    const activePinned = pinnedPenalties.filter(e => !e.served);
    if (activePinned.length > 0) {
        html += '<div class="pinned-section">';
        html += '<div class="pinned-header">ACTIVE PENALTIES</div>';
        html += activePinned.map(e => renderEventItem(e, true)).join("");
        html += '</div>';
    }

    const filtered = events.filter(e => eventFilter[e.code] !== false);
    html += filtered.map(e => renderEventItem(e, false)).join("");

    if (!html) {
        html = '<div class="event-item placeholder">No events matching filter</div>';
    }

    list.innerHTML = html;
}

function updateStandings(lapDataPacket) {
    const items = lapDataPacket.lapDataItems;
    if (!items) return;

    const rows = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        const statusCar = lastCarStatusItems?.[i];
        const visualCompound = statusCar?.visualTyreCompound ?? -1;
        const tyreAge = statusCar?.tyresAgeLaps ?? null;
        rows.push({
            idx: i,
            pos: ld.carPosition,
            name: participantNames[i] || `Car ${i}`,
            lastLap: formatTime(ld.lastLapTimeInMs),
            gapMs: ld.deltaToRaceLeaderMinutesPart * 60000 + ld.deltaToRaceLeaderMsPart,
            pitStatus: PIT_STATUS[ld.pitStatus] || "",
            visualCompound,
            tyreAge,
            isPlayer: i === playerCarIndex,
        });
    }

    rows.sort((a, b) => a.pos - b.pos);

    const tbody = el("standingsBody");
    if (!tbody) return;
    tbody.innerHTML = rows.map(r => {
        const gap = r.pos === 1 ? "Leader" : formatTime(r.gapMs);
        const compInfo = getVisualCompoundInfo(r.visualCompound);
        const abbr = getCompoundAbbr(compInfo.name);
        const ageStr = r.tyreAge !== null && r.tyreAge >= 0 ? r.tyreAge : "";
        const tyreBadge = `<span class="standings-tyre-wrap"><span class="tyreset-badge tyreset-badge-sm ${compInfo.css}">${abbr}</span><span class="standings-tyre-age">${ageStr}</span></span>`;
        return `<tr class="${r.isPlayer ? "player-row" : ""}">
            <td>${r.pos}</td>
            <td>${r.name}</td>
            <td>${gap}</td>
            <td>${r.lastLap}</td>
            <td class="standings-tyre-cell">${tyreBadge}</td>
            <td class="pit-status">${r.pitStatus}</td>
        </tr>`;
    }).join("");
}

const _VISUAL_COMPOUND_INFO = {
    16: { name: "Soft", css: "compound-soft", dot: "#ff3333" },
    17: { name: "Medium", css: "compound-medium", dot: "#ffd700" },
    18: { name: "Hard", css: "compound-hard", dot: "#e0e0e0" },
    7: { name: "Inter", css: "compound-inter", dot: "#00cc00" },
    8: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
    9: { name: "Dry", css: "compound-hard", dot: "#c0c0c0" },
    10: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
    15: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
    19: { name: "Super Soft", css: "compound-soft", dot: "#9B3CC4" },
    20: { name: "Soft", css: "compound-soft", dot: "#ff3333" },
    21: { name: "Medium", css: "compound-medium", dot: "#ffd700" },
    22: { name: "Hard", css: "compound-hard", dot: "#e0e0e0" },
    // F2 2024/2025
    11: { name: "Super Soft", css: "compound-super-soft", dot: "#9B3CC4" },
    12: { name: "Soft", css: "compound-soft", dot: "#ff3333" },
    13: { name: "Medium", css: "compound-medium", dot: "#ffd700" },
    14: { name: "Hard", css: "compound-hard", dot: "#e0e0e0" },
};
const _VISUAL_COMPOUND_FALLBACK = { name: "Unknown", css: "compound-unknown", dot: "#888" };

function getVisualCompoundInfo(visualId) {
    return _VISUAL_COMPOUND_INFO[visualId] || _VISUAL_COMPOUND_FALLBACK;
}

function getCompoundAbbr(name) {
    const map = { "Super Soft": "SS", "Soft": "S", "Medium": "M", "Hard": "H", "Dry": "D", "Inter": "I", "Wet": "W" };
    return map[name] || (name[0] || "?");
}

function getActualCompoundBadgeText(actualId, fallbackVisualName) {
    const n = ACTUAL_COMPOUNDS[actualId];
    if (n === "Inter") return "I";
    if (n === "Wet" || n === "W") return "W";
    if (n === "Dry") return "D";
    if (n && /^C[0-9]$/.test(n)) return n;
    return getCompoundAbbr(fallbackVisualName || "");
}

function updateTyreSets(data) {
    if (data.carIdx !== playerCarIndex) return;

    const sets = data.tyreSetDataItems;
    const fittedIdx = data.fittedIdx;
    if (!sets || sets.length === 0) return;

    const compoundOrder = ["Super Soft", "Soft", "Medium", "Hard", "Dry", "Inter", "Wet"];

    const annotated = sets.map((s, i) => ({
        ...s,
        idx: i,
        isFitted: i === fittedIdx,
        compoundInfo: getVisualCompoundInfo(s.visualTyreCompound),
    })).filter(s => s.visualTyreCompound !== 0 || s.actualTyreCompound !== 0);

    const available = annotated.filter(s => s.available || s.isFitted);

    // Group available by compound
    const availableByCompound = {};
    for (const s of available) {
        const name = s.compoundInfo.name;
        if (!availableByCompound[name]) availableByCompound[name] = [];
        availableByCompound[name].push(s);
    }

    // Sort compounds by compoundOrder
    const sortedCompounds = Object.keys(availableByCompound).sort((a, b) => {
        const ai = compoundOrder.indexOf(a);
        const bi = compoundOrder.indexOf(b);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Sort: fitted first, then by wear ascending (freshest first)
    for (const comp of sortedCompounds) {
        availableByCompound[comp].sort((a, b) => (b.isFitted - a.isFitted) || (a.wear - b.wear));
    }

    const container = el("tyreSetGroups");
    if (!container) return;

    // Wear-fill colour: 4-step scale (fresh → spent).
    const wearFillColor = (w) => w <= 25 ? "#3ecf8e" : w <= 50 ? "#f5c518" : w <= 75 ? "#ff9f0a" : "#ff453a";

    const parts = [];

    for (const compound of sortedCompounds) {
        const setsList = availableByCompound[compound];
        const compoundCss = setsList[0].compoundInfo.css || "compound-unknown";
        parts.push(`<div class="ts-group">`);
        parts.push(`<div class="ts-group-head"><span class="ts-group-dot ${compoundCss}"></span><span class="ts-group-name">${compound}</span><span class="ts-group-count">${setsList.length}</span></div>`);

        for (const s of setsList) {
            const wearPct = s.wear;
            const fillColor = wearFillColor(wearPct);

            const delta = s.lapDeltaTime;
            const deltaCls = delta > 0 ? "ts-delta--slower" : delta < 0 ? "ts-delta--faster" : "ts-delta--zero";
            const deltaText = delta === 0
                ? "±0.0s"
                : `${delta > 0 ? "+" : "−"}${(Math.abs(delta) / 1000).toFixed(1)}s`;

            const grip = formatTyreSetGrip(s.actualTyreCompound, wearPct);
            const gripHtml = grip
                ? `<span class="ts-grip" style="color:${grip.color}">${grip.text}</span>`
                : `<span class="ts-grip ts-grip--na">—</span>`;

            const rowCss = s.compoundInfo.css || "compound-unknown";
            const wrate = getCompoundWearRate(s.actualTyreCompound);
            const tipTitle = `Wear ${wearPct}%${wrate != null ? ' · Rate ' + wrate.toFixed(2) + '%/L' : ''}${s.isFitted ? ' · Fitted' : ''}`;

            parts.push(`<div class="ts-set-row${s.isFitted ? " ts-set-row--fitted" : ""}" title="${tipTitle.replace(/"/g, '&quot;')}">
                <span class="ts-row-accent ${rowCss}"></span>
                <div class="ts-wear">
                    <div class="ts-wear-track"><div class="ts-wear-fill" style="width:${wearPct}%;background:${fillColor}"></div></div>
                    <span class="ts-wear-pct">${wearPct}%</span>
                </div>
                <span class="ts-delta ${deltaCls}">${deltaText}</span>
                <span class="ts-life">${s.lifeSpan}L</span>
                ${gripHtml}
            </div>`);
        }

        parts.push(`</div>`);
    }

    container.innerHTML = parts.length > 0 ? parts.join("") : '<div class="tyreset-placeholder">No tyre sets available</div>';

    // Fitted summary block
    const fittedEl = el("tyreSetFitted");
    if (fittedEl) {
        const fitted = annotated.find(s => s.isFitted);
        if (fitted) {
            const fName = fitted.compoundInfo.name;
            const fCss = fitted.compoundInfo.css || "compound-unknown";
            const fWearColor = wearFillColor(fitted.wear);
            fittedEl.innerHTML = `<div class="ts-fitted-left">
                    <span class="ts-fitted-label">Fitted · On Car</span>
                    <span class="ts-fitted-name ${fCss}">${fName}</span>
                </div>
                <div class="ts-fitted-right">
                    <div class="ts-fitted-stat"><span class="ts-fitted-val" style="color:${fWearColor}">${fitted.wear}%</span><span class="ts-fitted-cap">Wear</span></div>
                    <div class="ts-fitted-stat"><span class="ts-fitted-val">${fitted.lifeSpan}L</span><span class="ts-fitted-cap">Life</span></div>
                </div>`;
            fittedEl.hidden = false;
        } else {
            fittedEl.innerHTML = "";
            fittedEl.hidden = true;
        }
    }
}

// Reworked Pit Stop Predictor — leads on the game's own pit strategy (ideal/latest
// window lap + predicted rejoin position), urgency colour-coded against the current
// lap. Exit traffic gaps are estimated from a fixed pit-lane loss (no editable input).
const PP_FRONT_WING_REPAIR_SEC = 7.0;   // F1: a front-wing change costs ~7s on top of the stop
const PP_WING_REPAIR_THRESHOLD = 15;    // % front-wing damage that warrants a repair stop
const PP_COL = {
    blue: "#3a8dff", green: "#3ecf8e", amber: "#ff9f0a", red: "#ff453a",
    redSoft: "#ff6b6b", yellow: "#f5c518", text: "#cdd3db", dim: "#8d97a5",
};

function ppEmptyStateHtml() {
    return '<div class="pp-empty">'
        + '<div class="pp-empty-icon"><span class="pp-empty-dash"></span></div>'
        + '<div class="pp-empty-title">No pit strategy yet</div>'
        + '<div class="pp-empty-sub">Awaiting telemetry</div>'
        + '</div>';
}

function ppLapTimelineHtml(cur, ideal, latest, color) {
    const ds = Math.min(cur, ideal) - 2;
    const de = Math.max(cur, latest) + 2;
    const span = Math.max(1, de - ds);
    const pct = (l) => ((l - ds) / span) * 100;
    return '<div class="pp-timeline">'
        + `<div class="pp-tl-curlabel" style="left:${pct(cur)}%;color:${color}">L${cur}</div>`
        + '<div class="pp-tl-track"></div>'
        + `<div class="pp-tl-band" style="left:${pct(ideal)}%;width:${pct(latest) - pct(ideal)}%"></div>`
        + `<div class="pp-tl-ideal" style="left:${pct(ideal)}%"></div>`
        + `<div class="pp-tl-cur" style="left:${pct(cur)}%;background:${color};box-shadow:0 0 6px ${color}"></div>`
        + `<div class="pp-tl-dot" style="left:${pct(cur)}%;background:${color}"></div>`
        + `<div class="pp-tl-lo" style="left:${pct(ideal)}%">L${ideal}</div>`
        + `<div class="pp-tl-hi" style="left:${pct(latest)}%">L${latest}</div>`
        + '</div>';
}

function ppTrafficRowHtml(cap, name, gapSec) {
    if (!name) {
        return `<div class="pp-traffic-row"><span class="pp-traffic-cap">${cap}</span>`
            + '<span class="pp-traffic-name pp-traffic-empty">—</span>'
            + '<span class="pp-traffic-gap">--</span></div>';
    }
    const tight = gapSec < 1.0, clean = gapSec > 3.0;
    const tag = tight ? "DRS" : clean ? "CLEAN AIR" : "";
    const tagCol = tight ? PP_COL.amber : PP_COL.green;
    const gapCol = tight ? PP_COL.amber : clean ? PP_COL.green : PP_COL.text;
    const tagHtml = tag
        ? `<span class="pp-traffic-tag" style="color:${tagCol};border-color:${tagCol}55">${tag}</span>`
        : "";
    return `<div class="pp-traffic-row"><span class="pp-traffic-cap">${cap}</span>`
        + `<span class="pp-traffic-name">${escapeXmlText(name)}</span>`
        + tagHtml
        + `<span class="pp-traffic-gap" style="color:${gapCol}">+${gapSec.toFixed(1)}s</span></div>`;
}

// Cars the player would rejoin between, with gaps estimated from a fixed pit-lane loss.
function ppComputeExitTraffic(items, pitLossMs) {
    const sorted = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        const gapToLeaderMs = ld.deltaToRaceLeaderMinutesPart * 60000 + ld.deltaToRaceLeaderMsPart;
        sorted.push({ gapToLeaderMs, name: participantNames[i] || `Car ${i}`, isPlayer: i === playerCarIndex });
    }
    const playerEntry = sorted.find(r => r.isPlayer);
    if (!playerEntry) return { ahead: null, behind: null, rejoinPos: 0 };
    const playerGapAfterPit = playerEntry.gapToLeaderMs + pitLossMs;
    const order = sorted
        .filter(r => !r.isPlayer)
        .map(r => ({ ...r, eff: r.gapToLeaderMs }))
        .concat([{ ...playerEntry, eff: playerGapAfterPit }])
        .sort((a, b) => a.eff - b.eff);
    const pi = order.findIndex(r => r.isPlayer);
    const ahead = pi > 0 ? { name: order[pi - 1].name, gap: (playerGapAfterPit - order[pi - 1].eff) / 1000 } : null;
    const behind = pi < order.length - 1 ? { name: order[pi + 1].name, gap: (order[pi + 1].eff - playerGapAfterPit) / 1000 } : null;
    // Predicted rejoin position = player's slot in the post-pit order (1-based).
    return { ahead, behind, rejoinPos: pi + 1 };
}

function updatePitPredictor() {
    const body = el("pitPredictorBody");
    if (!body) return;

    const sp = lastSessionPacket;
    const items = lastLapDataPacket?.lapDataItems;
    const playerLap = items?.[playerCarIndex];

    const idealLap = sp?.pitStopWindowIdealLap ?? 0;
    const latestLap = sp?.pitStopWindowLatestLap ?? 0;
    const gameRejoinPos = sp?.pitStopRejoinPosition ?? 0;

    // Require only that the player is racing. The game's pit window (ideal/latest lap)
    // and rejoin position are 0 unless a stop is planned/mandatory — but we can still
    // estimate the "pit now" outcome (rejoin + traffic) from live gaps in any race.
    if (!playerLap || playerLap.resultStatus < 2) {
        body.innerHTML = ppEmptyStateHtml();
        return;
    }

    // The game only fills the pit window when there's a planned/mandatory stop.
    const hasWindow = idealLap > 0 && latestLap > 0;

    const currentLap = playerLap.currentLapNum || 0;
    const currentPos = playerLap.carPosition || 0;

    // Front-wing damage forces a pit and adds repair time to the stop.
    const dmg = lastCarDamagePacket?.carDamageDataItems?.[playerCarIndex];
    const wingDmg = dmg ? Math.max(dmg.frontLeftWingDamage || 0, dmg.frontRightWingDamage || 0) : 0;
    const hasWingDamage = wingDmg >= PP_WING_REPAIR_THRESHOLD;
    const repairSec = hasWingDamage ? PP_FRONT_WING_REPAIR_SEC : 0;

    // Urgency against the window (only meaningful when the game gave us one).
    let statusText, statusColor;
    if (hasWindow) {
        if (currentLap < idealLap) {
            const n = idealLap - currentLap;
            statusText = `PIT IN ${n} ${n === 1 ? "LAP" : "LAPS"}`;
            statusColor = PP_COL.blue;
        } else if (currentLap <= latestLap) {
            const left = latestLap - currentLap;
            statusText = left <= 1 ? "WINDOW CLOSING" : "PIT NOW";
            statusColor = left <= 1 ? PP_COL.amber : PP_COL.green;
        } else {
            statusText = "WINDOW MISSED";
            statusColor = PP_COL.red;
        }
        if (hasWingDamage) { statusText = "BOX NOW · REPAIR"; statusColor = PP_COL.red; }
    }
    const traffic = ppComputeExitTraffic(items, (DEFAULT_PIT_TIME_SEC + repairSec) * 1000);

    // Prefer the game's rejoin prediction; fall back to our own estimate from live gaps
    // (which is all we have when no stop is planned).
    const rejoinEstimated = gameRejoinPos <= 0;
    const rejoinPos = rejoinEstimated ? (traffic.rejoinPos || 0) : gameRejoinPos;
    const hasRejoin = rejoinPos > 0;

    const delta = rejoinPos - currentPos;
    const dCol = delta <= 0 ? PP_COL.green : delta <= 2 ? PP_COL.yellow : PP_COL.redSoft;
    const arrow = delta > 0 ? "▼" : delta < 0 ? "▲" : "–";
    const changeText = delta === 0 ? "even" : `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "place" : "places"}`;

    let html = "";

    if (hasWingDamage) {
        html += '<div class="pp-damage">'
            + '<span class="pp-damage-icon">⚠</span>'
            + '<span class="pp-damage-label">FRONT WING DAMAGE</span>'
            + `<span class="pp-damage-repair">+${repairSec.toFixed(1)}s repair</span>`
            + '</div>';
    }

    if (hasWindow) {
        html += '<div class="pp-section pp-window-sec">'
            + '<div class="pp-row-top"><span class="pp-label">Pit Window</span>'
            + `<span class="pp-window-laps">Laps ${idealLap}–${latestLap}</span></div>`
            + '<div class="pp-status">'
            + `<span class="pp-status-dot" style="background:${statusColor};box-shadow:0 0 7px ${statusColor}"></span>`
            + `<span class="pp-status-text" style="color:${statusColor}">${statusText}</span></div>`
            + ppLapTimelineHtml(currentLap, idealLap, latestLap, statusColor)
            + '</div>';
    }

    if (hasRejoin) {
        const rejoinLabel = rejoinEstimated ? "Rejoin if pit now" : "Rejoin Position";
        html += '<div class="pp-section pp-rejoin-sec">'
            + `<div class="pp-rejoin-left"><span class="pp-label">${rejoinLabel}</span>`
            + `<div class="pp-rejoin-num" style="color:${dCol}">P${rejoinPos}</div>`
            + (hasWingDamage ? `<span class="pp-rejoin-repair">incl. +${repairSec.toFixed(1)}s wing repair</span>` : "")
            + '</div>'
            + '<div class="pp-rejoin-right">'
            + `<span class="pp-rejoin-flow">P${currentPos} → P${rejoinPos}</span>`
            + `<span class="pp-rejoin-badge" style="color:${dCol};background:${dCol}1f">${arrow} ${changeText}</span>`
            + '</div></div>';
    }

    html += '<div class="pp-section pp-traffic-sec">'
        + '<span class="pp-label">Exit Traffic</span>'
        + ppTrafficRowHtml("AHEAD", traffic.ahead?.name, traffic.ahead?.gap)
        + ppTrafficRowHtml("BEHIND", traffic.behind?.name, traffic.behind?.gap)
        + '</div>';

    body.innerHTML = html;
}

function updateSessionHistory(data) {
    sessionHistories[data.carIdx] = data;
    scheduleRafUpdate("gapBoard", updateGapBoard);
    scheduleRafUpdate("qualiStandings", updateQualiStandings);
    scheduleRafUpdate("lapTimes", updateLapTimesWidget);
    if (data.carIdx === playerCarIndex) {
        const car = lastLapDataPacket?.lapDataItems?.[playerCarIndex];
        if (car) updateLapDataWidget(car);
    }
}

function getQualiDriverStatus(ld) {
    if (ld.pitStatus === 2) return { label: "In Pit", cls: "qs-pit" };
    if (ld.pitStatus === 1) return { label: "Pitting", cls: "qs-pit" };
    if (ld.driverStatus === 0) return { label: "Garage", cls: "qs-garage" };
    if (ld.driverStatus === 3) return { label: "Out Lap", cls: "qs-outlap" };
    if (ld.driverStatus === 1) return { label: "Flying", cls: "qs-flying" };
    if (ld.driverStatus === 2) return { label: "In Lap", cls: "qs-inlap" };
    return { label: "On Track", cls: "" };
}

function getBestLapFromHistory(carIdx) {
    const hist = sessionHistories[carIdx];
    if (!hist || !hist.lapHistoryDataItems || hist.bestLapTimeLapNum === 0) return 0;
    const lapIdx = hist.bestLapTimeLapNum - 1;
    const entry = hist.lapHistoryDataItems[lapIdx];
    return entry?.lapTimeInMs || 0;
}

function getBestSectorMs(carIdx, sectorNum) {
    const hist = sessionHistories[carIdx];
    if (!hist || !hist.lapHistoryDataItems) return 0;
    const lapNumField = sectorNum === 1 ? "bestSector1LapNum"
                      : sectorNum === 2 ? "bestSector2LapNum"
                      : "bestSector3LapNum";
    const lapNum = hist[lapNumField];
    if (!lapNum) return 0;
    const entry = hist.lapHistoryDataItems[lapNum - 1];
    if (!entry) return 0;
    if (sectorNum === 1) return entry.sector1TimeMinutesPart * 60000 + entry.sector1TimeMsPart;
    if (sectorNum === 2) return entry.sector2TimeMinutesPart * 60000 + entry.sector2TimeMsPart;
    return entry.sector3TimeMinutesPart * 60000 + entry.sector3TimeMsPart;
}

function sectorCellHtml(currentMs, bestMs, isActive) {
    if (isActive) return `<span class="qs-sector-active">...</span>`;
    if (!currentMs) return `<span class="qs-sector-none">--</span>`;
    const text = formatTime(currentMs);
    if (bestMs && currentMs <= bestMs) return `<span class="qs-sector-up">${text}</span>`;
    if (bestMs && currentMs > bestMs) return `<span class="qs-sector-down">${text}</span>`;
    return `<span>${text}</span>`;
}

function updateQualiStandings() {
    const tbody = document.getElementById("qualiStandingsBody");
    if (!tbody) return;
    if (!lastLapDataPacket) return;

    const items = lastLapDataPacket.lapDataItems;
    if (!items) return;

    const rows = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;

        const bestLapMs = getBestLapFromHistory(i);
        const status = getQualiDriverStatus(ld);
        const currentSector = ld.sector;
        const s1Ms = ld.sector1TimeMinutesPart * 60000 + ld.sector1TimeMsPart;
        const s2Ms = ld.sector2TimeMinutesPart * 60000 + ld.sector2TimeMsPart;
        const lapInvalid = ld.currentLapInvalid === 1;
        const deltaMs = ld.driverStatus === 1 ? getLiveDeltaMs(i, ld) : null;

        rows.push({
            idx: i,
            pos: ld.carPosition,
            name: participantNames[i] || `Car ${i}`,
            bestLapMs,
            status,
            currentSector,
            s1Ms,
            s2Ms,
            lapInvalid,
            deltaMs,
            isPlayer: i === playerCarIndex,
            driverStatus: ld.driverStatus,
        });
    }

    rows.sort((a, b) => {
        if (a.bestLapMs && b.bestLapMs) return a.bestLapMs - b.bestLapMs;
        if (a.bestLapMs) return -1;
        if (b.bestLapMs) return 1;
        return a.pos - b.pos;
    });

    const bestOverall = rows.length > 0 && rows[0].bestLapMs ? rows[0].bestLapMs : 0;

    tbody.innerHTML = rows.map((r, i) => {
        const pos = i + 1;
        const rowCls = [
            r.isPlayer ? "player-row" : "",
            r.status.cls ? "qs-row-" + r.status.cls : "",
        ].filter(Boolean).join(" ");

        const bestLap = r.bestLapMs ? formatTime(r.bestLapMs) : "--";
        const gap = (i === 0 || !r.bestLapMs || !bestOverall)
            ? (i === 0 && r.bestLapMs ? "--" : "No Time")
            : "+" + ((r.bestLapMs - bestOverall) / 1000).toFixed(3);

        const bestS1 = getBestSectorMs(r.idx, 1);
        const bestS2 = getBestSectorMs(r.idx, 2);
        const bestS3 = getBestSectorMs(r.idx, 3);

        const onTrack = r.driverStatus >= 1 && r.driverStatus <= 4 && r.status.cls !== "qs-pit" && r.status.cls !== "qs-garage";
        const s1Html = onTrack ? sectorCellHtml(r.currentSector >= 1 ? r.s1Ms : 0, bestS1, r.currentSector === 0) : '<span class="qs-sector-none">--</span>';
        const s2Html = onTrack ? sectorCellHtml(r.currentSector >= 2 ? r.s2Ms : 0, bestS2, r.currentSector === 1) : '<span class="qs-sector-none">--</span>';
        const s3Html = onTrack ? sectorCellHtml(0, bestS3, r.currentSector === 2) : '<span class="qs-sector-none">--</span>';

        const statusBadge = `<span class="qs-badge ${r.status.cls}">${r.status.label}</span>`;
        const invalidMark = r.lapInvalid && r.driverStatus === 1 ? ' <span class="qs-invalid">✗</span>' : "";

        let deltaTd;
        if (r.deltaMs !== null) {
            const secs = r.deltaMs / 1000;
            const sign = secs >= 0 ? "+" : "";
            const formatted = sign + secs.toFixed(3);
            const cls = r.lapInvalid ? "qs-sector-none" : secs < -0.0005 ? "qs-sector-up" : secs > 0.0005 ? "qs-sector-down" : "";
            deltaTd = `<span class="${cls}">${formatted}</span>`;
        } else {
            deltaTd = `<span class="qs-sector-none">--</span>`;
        }

        return `<tr class="${rowCls}">
            <td>${pos}</td>
            <td>${r.name}</td>
            <td>${bestLap}</td>
            <td class="qs-gap">${gap}</td>
            <td class="qs-delta-pb">${deltaTd}</td>
            <td>${statusBadge}${invalidMark}</td>
            <td class="qs-sector">${s1Html}</td>
            <td class="qs-sector">${s2Html}</td>
            <td class="qs-sector">${s3Html}</td>
        </tr>`;
    }).join("");
}

/**
 * Finds the best completed lap (by lapTimeInMs) from SessionHistory,
 * excluding the current lap. Returns the history entry or null.
 */
function getBestPreviousLapEntry(carIdx, currentLapNum) {
    const hist = sessionHistories[carIdx];
    if (!hist || !hist.lapHistoryDataItems) return null;
    let bestEntry = null;
    let bestTime = 0;
    for (let i = 0; i < hist.lapHistoryDataItems.length; i++) {
        if (i + 1 === currentLapNum) continue;
        const e = hist.lapHistoryDataItems[i];
        if (!e || !e.lapTimeInMs) continue;
        if (bestTime === 0 || e.lapTimeInMs < bestTime) {
            bestTime = e.lapTimeInMs;
            bestEntry = e;
        }
    }
    return bestEntry;
}

/**
 * Delta (ms) between current lap's committed sectors and the same sectors
 * from the driver's previous best lap (fastest full lap, not best individual sectors).
 * - sector 0 (in S1): nothing committed → null
 * - sector 1 (in S2): S1 done → s1 − bestLapS1
 * - sector 2 (in S3): S1+S2 done → (s1+s2) − (bestLapS1+bestLapS2)
 */
function getLiveDeltaMs(carIdx, ld) {
    if (!ld || ld.driverStatus !== 1) return null;

    const sector = ld.sector;
    if (sector === 0) return null;

    const bestLap = getBestPreviousLapEntry(carIdx, ld.currentLapNum);
    if (!bestLap) return null;

    const s1Actual = ld.sector1TimeMinutesPart * 60000 + ld.sector1TimeMsPart;
    const blS1 = bestLap.sector1TimeMinutesPart * 60000 + bestLap.sector1TimeMsPart;

    if (sector === 1) {
        if (!s1Actual || !blS1) return null;
        return s1Actual - blS1;
    }

    if (sector === 2) {
        const s2Actual = ld.sector2TimeMinutesPart * 60000 + ld.sector2TimeMsPart;
        const blS2 = bestLap.sector2TimeMinutesPart * 60000 + bestLap.sector2TimeMsPart;
        if (!s1Actual || !s2Actual || !blS1 || !blS2) return null;
        return (s1Actual + s2Actual) - (blS1 + blS2);
    }

    return null;
}

function escapeXmlText(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function driverAbbrFromName(fullName) {
    if (!fullName || typeof fullName !== "string") return "?";
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "?";
    const last = parts[parts.length - 1];
    return (last.length <= 3 ? last : last.slice(0, 3)).toUpperCase();
}

function formatGapRingOuterMs(ms, isLeader) {
    if (isLeader) return "—";
    if (ms == null || ms <= 0) return "—";
    return "+" + (ms / 1000).toFixed(3);
}

function formatGapRingIntervalMs(ms, isLeader) {
    if (isLeader) return "LEAD";
    if (ms == null || ms <= 0) return "—";
    return "+" + (ms / 1000).toFixed(3);
}

function normalizeLapDistanceMeters(d, lapLen) {
    if (!Number.isFinite(d) || lapLen <= 0) return 0;
    let x = d % lapLen;
    if (x < 0) x += lapLen;
    if (x < 0) x = 0;
    if (x >= lapLen) x = lapLen - 1e-6;
    return x;
}

/** 12 o’clock = lap distance 0 (start/finish) */
function lapDistanceToAngleRad(lapDistNorm, lapLen) {
    const t = lapLen > 0 ? lapDistNorm / lapLen : 0;
    return -Math.PI / 2 + t * 2 * Math.PI;
}

function getGapRingLapLengthMeters(items, activeIdxs) {
    const sp = lastSessionPacket;
    const tl = sp?.trackLength;
    if (tl != null && tl > 200) return tl;

    const s3 = sp?.sector3LapDistanceStart;
    if (s3 != null && s3 > 200) return Math.max(s3 / 0.38, 3500);

    for (const i of activeIdxs) {
        const d = items[i]?.lapDistance;
        if (d != null && d > gapRingObservedMaxLapDist) gapRingObservedMaxLapDist = d;
    }
    return Math.max(gapRingObservedMaxLapDist * 1.06, 4500);
}

function updateGapRing() {
    const svg = el("gapRingSvg");
    const elAheadName = el("gapRingAheadName");
    const elAheadGap = el("gapRingAheadGap");
    const elPlayer = el("gapRingPlayer");
    const elBehindGap = el("gapRingBehindGap");
    const elBehindName = el("gapRingBehindName");
    if (!svg && !elPlayer) return;

    if (!lastLapDataPacket) {
        if (svg) svg.innerHTML = "";
        if (elAheadName) {
            elAheadName.innerHTML = "";
            elAheadName.style.removeProperty("color");
        }
        if (elAheadGap) {
            elAheadGap.innerHTML = "";
            elAheadGap.style.removeProperty("color");
        }
        if (elPlayer) elPlayer.innerHTML = '<span class="gap-ring-c-dim">Waiting…</span>';
        if (elBehindGap) {
            elBehindGap.innerHTML = "";
            elBehindGap.style.removeProperty("color");
        }
        if (elBehindName) {
            elBehindName.innerHTML = "";
            elBehindName.style.removeProperty("color");
        }
        return;
    }

    const items = lastLapDataPacket.lapDataItems;
    if (!items) return;

    const sorted = [];
    const activeIdxs = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        activeIdxs.push(i);
        const gapLeaderMs = ld.deltaToRaceLeaderMinutesPart * 60000 + ld.deltaToRaceLeaderMsPart;
        const gapAheadMs = ld.deltaToCarInFrontMinutesPart * 60000 + ld.deltaToCarInFrontMsPart;
        sorted.push({
            idx: i,
            pos: ld.carPosition,
            name: participantNames[i] || `Car ${i}`,
            gapLeaderMs,
            gapAheadMs,
            currentLapNum: ld.currentLapNum,
            isPlayer: i === playerCarIndex,
        });
    }
    sorted.sort((a, b) => a.pos - b.pos);
    if (sorted.length === 0) {
        if (svg) svg.innerHTML = "";
        if (elAheadName) {
            elAheadName.innerHTML = "";
            elAheadName.style.removeProperty("color");
        }
        if (elAheadGap) {
            elAheadGap.innerHTML = "";
            elAheadGap.style.removeProperty("color");
        }
        if (elPlayer) elPlayer.innerHTML = '<span class="gap-ring-c-dim">No data</span>';
        if (elBehindGap) {
            elBehindGap.innerHTML = "";
            elBehindGap.style.removeProperty("color");
        }
        if (elBehindName) {
            elBehindName.innerHTML = "";
            elBehindName.style.removeProperty("color");
        }
        return;
    }

    const lapLen = getGapRingLapLengthMeters(items, activeIdxs);
    const n = sorted.length;
    const fontOuter = n > 16 ? 6.5 : n > 12 ? 7.5 : 8.5;
    const fontName = n > 16 ? 8 : n > 12 ? 9 : 10;
    const fontInner = n > 16 ? 6.5 : n > 12 ? 7.5 : 8.5;

    /** Driver dots + track ring (smaller ring; same radius for both). */
    const R_DOT = 76;
    /** Gap to leader / interval labels — further from dots than before */
    const R_OUTER = R_DOT + 38;
    const R_NAME = R_DOT + 14;
    const R_INNER = R_DOT - 24;
    /** When two cars share almost the same track angle, fan them slightly along the arc (r fixed). */
    const ANG_STACK_RAD = 0.052;
    const angBucket = new Map();
    function stackIndexForAngle(ang) {
        const key = Math.round(ang / 0.04);
        const c = angBucket.get(key) || 0;
        angBucket.set(key, c + 1);
        return c;
    }

    const placed = [];
    for (const d of sorted) {
        const ld = items[d.idx];
        const lapDistNorm = normalizeLapDistanceMeters(ld.lapDistance, lapLen);
        const angRaw = lapDistanceToAngleRad(lapDistNorm, lapLen);
        const stack = stackIndexForAngle(angRaw);
        const angDraw = angRaw + stack * ANG_STACK_RAD;
        const cos = Math.cos(angDraw);
        const sin = Math.sin(angDraw);
        const teamColor = teamAccentColor(participantTeamIds[d.idx], participantLiveryColors[d.idx]);
        placed.push({ d, cos, sin, teamColor });
    }

    const svgParts = [
        `<circle cx="0" cy="0" r="${R_DOT}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" />`,
        `<line x1="0" y1="-46" x2="0" y2="-80" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round" />`,
        `<text x="0" y="-84" class="gap-ring-sf" font-size="8" fill="rgba(255,255,255,0.4)" text-anchor="middle" dominant-baseline="auto">S/F</text>`,
    ];

    for (const { cos, sin } of placed) {
        svgParts.push(`<line x1="0" y1="0" x2="${cos * R_OUTER}" y2="${sin * R_OUTER}" class="gap-ring-spoke" stroke="rgba(255,255,255,0.09)" stroke-width="0.5" />`);
    }

    for (const { d, cos, sin, teamColor } of placed) {
        const cx = cos * R_DOT;
        const cy = sin * R_DOT;
        const rDotPx = d.isPlayer ? 5.5 : 4.5;
        const sw = d.isPlayer ? 1.8 : 1.1;
        svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${rDotPx}" fill="${teamColor}" fill-opacity="0.92" stroke="rgba(255,255,255,0.9)" stroke-width="${sw}" />`);
    }

    for (const { d, cos, sin, teamColor } of placed) {
        const isLeader = d.pos === 1;
        const outerText = formatGapRingOuterMs(d.gapLeaderMs, isLeader);
        const innerText = formatGapRingIntervalMs(d.gapAheadMs, isLeader);

        const ox = cos * R_OUTER;
        const oy = sin * R_OUTER;
        const mx = cos * R_NAME;
        const my = sin * R_NAME;
        const ix = cos * R_INNER;
        const iy = sin * R_INNER;

        const nameCls = d.isPlayer ? "gap-ring-txt-name gap-ring-txt-player" : "gap-ring-txt-name";
        svgParts.push(`<text x="${ox}" y="${oy}" class="gap-ring-txt-outer" font-size="${fontOuter}">${escapeXmlText(outerText)}</text>`);
        svgParts.push(`<text x="${mx}" y="${my}" class="${nameCls}" fill="${teamColor}" font-size="${fontName}" font-weight="600">${escapeXmlText(driverAbbrFromName(d.name))}</text>`);
        svgParts.push(`<text x="${ix}" y="${iy}" class="gap-ring-txt-inner" font-size="${fontInner}">${escapeXmlText(innerText)}</text>`);
    }

    if (svg) svg.innerHTML = svgParts.join("");

    if (!elPlayer) return;

    const pi = sorted.findIndex(x => x.isPlayer);
    if (pi < 0) {
        if (elAheadName) {
            elAheadName.innerHTML = "";
            elAheadName.style.removeProperty("color");
        }
        if (elAheadGap) {
            elAheadGap.innerHTML = "";
            elAheadGap.style.removeProperty("color");
        }
        elPlayer.innerHTML = '<span class="gap-ring-c-dim">No player car</span>';
        if (elBehindGap) {
            elBehindGap.innerHTML = "";
            elBehindGap.style.removeProperty("color");
        }
        if (elBehindName) {
            elBehindName.innerHTML = "";
            elBehindName.style.removeProperty("color");
        }
        return;
    }

    const p = sorted[pi];
    const ahead = pi > 0 ? sorted[pi - 1] : null;
    const behind = pi < n - 1 ? sorted[pi + 1] : null;
    const pLd = items[p.idx];
    const aheadMs = p.pos === 1 ? null : (pLd.deltaToCarInFrontMinutesPart * 60000 + pLd.deltaToCarInFrontMsPart);
    const behindMs = behind
        ? (items[behind.idx].deltaToCarInFrontMinutesPart * 60000 + items[behind.idx].deltaToCarInFrontMsPart)
        : null;

    const aheadTeamColor = ahead ? teamAccentColor(participantTeamIds[ahead.idx], participantLiveryColors[ahead.idx]) : null;
    const behindTeamColor = behind ? teamAccentColor(participantTeamIds[behind.idx], participantLiveryColors[behind.idx]) : null;

    if (elAheadName) {
        if (ahead) {
            elAheadName.textContent = `P${ahead.pos} ${driverAbbrFromName(ahead.name)}`;
            elAheadName.style.color = aheadTeamColor;
        } else {
            elAheadName.innerHTML = '<span class="gap-ring-c-dim">Leader</span>';
            elAheadName.style.removeProperty("color");
        }
    }

    if (elAheadGap) {
        if (ahead && aheadMs != null && aheadMs >= 0) {
            elAheadGap.textContent = `-${(aheadMs / 1000).toFixed(3)}`;
            elAheadGap.style.color = aheadTeamColor;
        } else {
            elAheadGap.innerHTML = '<span class="gap-ring-c-dim">—</span>';
            elAheadGap.style.removeProperty("color");
        }
    }

    elPlayer.textContent = `P${p.pos} ${driverAbbrFromName(p.name)}`;

    if (elBehindGap) {
        if (behind && behindMs != null && behindMs >= 0) {
            elBehindGap.textContent = `+${(behindMs / 1000).toFixed(3)}`;
            elBehindGap.style.color = behindTeamColor;
        } else {
            elBehindGap.innerHTML = '<span class="gap-ring-c-dim">—</span>';
            elBehindGap.style.removeProperty("color");
        }
    }

    if (elBehindName) {
        if (behind) {
            elBehindName.textContent = `P${behind.pos} ${driverAbbrFromName(behind.name)}`;
            elBehindName.style.color = behindTeamColor;
        } else {
            elBehindName.innerHTML = '<span class="gap-ring-c-dim">—</span>';
            elBehindName.style.removeProperty("color");
        }
    }
}

function updateGapBoard() {
    const container = el("gapBoardContent");
    if (!container) return;
    if (!lastLapDataPacket) return;

    const items = lastLapDataPacket.lapDataItems;
    if (!items) return;

    const sorted = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        sorted.push({ idx: i, pos: ld.carPosition, name: participantNames[i] || `Car ${i}`, isPlayer: i === playerCarIndex });
    }
    sorted.sort((a, b) => a.pos - b.pos);

    const playerSortIdx = sorted.findIndex(r => r.isPlayer);
    if (playerSortIdx === -1) return;

    let chosen;
    if (sorted.length <= 3) {
        chosen = sorted.slice(0, 3);
    } else if (playerSortIdx === 0) {
        chosen = sorted.slice(0, 3);
    } else if (playerSortIdx === sorted.length - 1) {
        chosen = sorted.slice(-3);
    } else {
        chosen = [sorted[playerSortIdx - 1], sorted[playerSortIdx], sorted[playerSortIdx + 1]];
    }

    const playerHistory = sessionHistories[playerCarIndex];
    const playerNumLaps = playerHistory?.numLaps || 0;

    let lapColumns = [];
    if (playerNumLaps >= 2) {
        const endLap = playerNumLaps - 1;
        const startLap = Math.max(0, endLap - GAP_BOARD_LAPS + 1);
        for (let l = startLap; l <= endLap; l++) lapColumns.push(l);
    }

    if (lapColumns.length === 0) {
        container.innerHTML = '<div class="gap-board-placeholder">Waiting for lap history...</div>';
        return;
    }

    function getLapTimeMs(carIdx, lapIndex) {
        const hist = sessionHistories[carIdx];
        if (!hist || !hist.lapHistoryDataItems) return 0;
        const entry = hist.lapHistoryDataItems[lapIndex];
        if (!entry || !entry.lapTimeInMs) return 0;
        return entry.lapTimeInMs;
    }

    function formatLapCell(carIdx, lapIndex, isPlayer) {
        const timeMs = getLapTimeMs(carIdx, lapIndex);
        const playerTimeMs = getLapTimeMs(playerCarIndex, lapIndex);

        if (!timeMs) return { text: "--", cls: "gap-cell-dim" };

        if (isPlayer) {
            return { text: formatTime(timeMs), cls: "" };
        }

        if (playerTimeMs && timeMs) {
            const deltaMs = timeMs - playerTimeMs;
            if (deltaMs < 0) {
                return { text: (deltaMs / 1000).toFixed(3), cls: "gap-cell-slower" };
            } else if (deltaMs > 0) {
                return { text: "+" + (deltaMs / 1000).toFixed(3), cls: "gap-cell-faster" };
            }
            return { text: formatTime(timeMs), cls: "" };
        }

        return { text: formatTime(timeMs), cls: "" };
    }

    const parts = ['<table class="gap-table"><thead><tr><th class="gap-hdr-label">LAST ' + lapColumns.length + ' LAPS</th>'];
    for (const lapIdx of lapColumns) {
        parts.push(`<th>LAP ${lapIdx + 1}</th>`);
    }
    parts.push('</tr></thead><tbody>');

    for (const driver of chosen) {
        const rowCls = driver.isPlayer ? "gap-row-player" : "";
        const posColor = driver.isPlayer ? "gap-pos-player" : "";
        parts.push(`<tr class="${rowCls}"><td class="gap-driver-cell"><span class="gap-pos ${posColor}">${driver.pos}</span> <span class="gap-driver-name">${escapeHtml(driver.name)}</span></td>`);
        for (const lapIdx of lapColumns) {
            const cell = formatLapCell(driver.idx, lapIdx, driver.isPlayer);
            parts.push(`<td class="gap-time-cell ${cell.cls}">${cell.text}</td>`);
        }
        parts.push('</tr>');
    }

    parts.push('</tbody></table>');
    container.innerHTML = parts.join("");
}


function sectorMsFromHistoryEntry(entry, sectorNum) {
    if (!entry) return 0;
    if (sectorNum === 1) return (entry.sector1TimeMinutesPart || 0) * 60000 + (entry.sector1TimeMsPart || 0);
    if (sectorNum === 2) return (entry.sector2TimeMinutesPart || 0) * 60000 + (entry.sector2TimeMsPart || 0);
    return (entry.sector3TimeMinutesPart || 0) * 60000 + (entry.sector3TimeMsPart || 0);
}

function equalPerfTooltipAndIcon(equalB) {
    const isEqual = equalB === 1;
    const title = isEqual ? "Equal car performance" : "Realistic car performance";
    const letter = isEqual ? "E" : "R";
    return `<span class="lt-perf-ico" title="${title}">${letter}</span>`;
}

const LT_SETUP_ICONS = {
    aero: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 11.2c2.6-4.4 6.3-5 9-3.8 2.2 1 3.6 2.7 4 4.6H4.2l-2.7-.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4.2 12h10.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    diff: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>',
    geom: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 13h11M2.5 13V4.5M2.5 13l10.5-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    susp: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h10M3 13.5h10M4 4.5l8 1.5-8 1.5 8 1.5-8 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    brake: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M11.8 4.2l1.3-1.3M4.2 11.8l-1.3 1.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
    tyre: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.5V3M8 13v-2.5M5.5 8H3M13 8h-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'
};

function formatCarSetupPopoverHtml(setup) {
    if (!setup) {
        return '<p class="lt-setup-empty">No car setup data.</p>';
    }
    const num = (v, d) => (v != null && Number.isFinite(Number(v))) ? Number(v).toFixed(d) : null;
    const int = (v) => (v != null && Number.isFinite(Number(v))) ? Number(v) : null;

    function bar(label, value, min, max, suffix) {
        if (value == null) return `<div class="lt-setup-row"><span class="lt-setup-label">${label}</span><span class="lt-setup-val">—</span></div>`;
        const range = max - min;
        const pct = range > 0 ? Math.max(0, Math.min(100, ((value - min) / range) * 100)) : 0;
        const display = suffix ? value + suffix : value;
        return `<div class="lt-setup-row"><span class="lt-setup-label">${label}</span><div class="lt-setup-bar-track"><div class="lt-setup-bar-fill" style="width:${pct.toFixed(1)}%"></div></div><span class="lt-setup-val">${display}</span></div>`;
    }

    function section(title, icon, rows) {
        return `<section class="lt-setup-section"><header class="lt-setup-section-title"><span class="lt-setup-section-icon">${icon}</span>${title}</header><div class="lt-setup-section-body">${rows}</div></section>`;
    }

    let html = "";
    html += section("Aerodynamics", LT_SETUP_ICONS.aero,
        bar("Front Wing", int(setup.frontWing), 0, 50, "") +
        bar("Rear Wing", int(setup.rearWing), 0, 50, ""));

    html += section("Transmission", LT_SETUP_ICONS.diff,
        bar("On Throttle", int(setup.onThrottle), 10, 100, "%") +
        bar("Off Throttle", int(setup.offThrottle), 10, 100, "%"));

    html += section("Suspension Geometry", LT_SETUP_ICONS.geom,
        bar("Front Camber", num(setup.frontCamber, 2), -3.50, -2.50, "°") +
        bar("Rear Camber", num(setup.rearCamber, 2), -2.00, -1.00, "°") +
        bar("Front Toe", num(setup.frontToe, 2), 0.00, 0.20, "°") +
        bar("Rear Toe", num(setup.rearToe, 2), 0.10, 0.25, "°"));

    html += section("Suspension", LT_SETUP_ICONS.susp,
        bar("Front Suspension", int(setup.frontSuspension), 1, 41, "") +
        bar("Rear Suspension", int(setup.rearSuspension), 1, 41, "") +
        bar("Front Anti-Roll Bar", int(setup.frontAntiRollBar), 1, 21, "") +
        bar("Rear Anti-Roll Bar", int(setup.rearAntiRollBar), 1, 21, "") +
        bar("Front Ride Height", int(setup.frontSuspensionHeight), 15, 35, "") +
        bar("Rear Ride Height", int(setup.rearSuspensionHeight), 40, 60, ""));

    html += section("Brakes", LT_SETUP_ICONS.brake,
        bar("Front Brake Bias", int(setup.brakeBias), 50, 70, "%") +
        bar("Brake Pressure", int(setup.brakePressure), 80, 100, "%"));

    html += section("Tyres", LT_SETUP_ICONS.tyre,
        bar("FR Tyre Pressure", num(setup.frontRightTyrePressure, 1), 22.5, 29.5, " psi") +
        bar("FL Tyre Pressure", num(setup.frontLeftTyrePressure, 1), 22.5, 29.5, " psi") +
        bar("RR Tyre Pressure", num(setup.rearRightTyrePressure, 1), 20.5, 26.5, " psi") +
        bar("RL Tyre Pressure", num(setup.rearLeftTyrePressure, 1), 20.5, 26.5, " psi"));

    return html;
}

function buildLapTimesSetupHtml(carIdx) {
    const setups = lastCarSetupsPacket?.carSetupData;
    const setup = (carIdx != null && carIdx >= 0 && carIdx <= 21) ? setups?.[carIdx] : null;
    return formatCarSetupPopoverHtml(setup);
}

function registerLapTimesSetup(html) {
    const id = "lt" + (++_lapTimesSetupIdSeq);
    _lapTimesSetupContent.set(id, html);
    return id;
}

function closeLapTimesSetupPopover() {
    const panel = el("lapTimesSetupPanel");
    if (panel) {
        panel.hidden = true;
        panel.innerHTML = "";
    }
}

function positionLapTimesPopover(anchor, panel) {
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    panel.style.maxHeight = "";
    const pw = panel.offsetWidth || 340;
    // Primary rule: popover's top-right corner coincides with button's top-left corner.
    let left = r.left - pw;
    let top = Math.max(margin, r.top);
    // Adaptive: if popover overflows the left edge, flip to the right side of the button.
    if (left < margin) {
        if (r.right + pw <= window.innerWidth - margin) {
            left = r.right;
        } else {
            left = Math.max(margin, window.innerWidth - pw - margin);
        }
    }
    // Adaptive: cap popover height to space available below `top`, so the popover
    // stays anchored to the button vertically and scrolls internally if too tall.
    const availH = Math.max(160, window.innerHeight - top - margin);
    panel.style.maxHeight = availH + "px";
    panel.style.left = left + "px";
    panel.style.top = top + "px";
}

function openLapTimesSetupPopover(anchor, html) {
    const panel = el("lapTimesSetupPanel");
    if (!panel || !html) return;
    // Move the panel to <body> to escape ancestor `contain: layout style paint`
    // on .grid-stack-item-content, which otherwise turns position: fixed into
    // position: absolute relative to the widget and breaks our anchoring.
    if (panel.parentElement !== document.body) {
        document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="lt-setup-panel-inner">${html}</div>`;
    panel.hidden = false;
    requestAnimationFrame(() => positionLapTimesPopover(anchor, panel));
}

let _ltExpandedBtn = null;

function ensureLapTimesMenuHandlers() {
    if (_lapTimesMenuBound) return;
    _lapTimesMenuBound = true;
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".lt-setup-btn");
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            const id = btn.dataset.ltSid;
            const prevOpen = btn === _ltExpandedBtn;
            if (_ltExpandedBtn) { _ltExpandedBtn.setAttribute("aria-expanded", "false"); _ltExpandedBtn = null; }
            if (prevOpen) {
                closeLapTimesSetupPopover();
                return;
            }
            const html = id ? _lapTimesSetupContent.get(id) : null;
            openLapTimesSetupPopover(btn, html || "<p>No setup data.</p>");
            btn.setAttribute("aria-expanded", "true");
            _ltExpandedBtn = btn;
            return;
        }
        if (!e.target.closest("#lapTimesSetupPanel")) {
            if (_ltExpandedBtn) { _ltExpandedBtn.setAttribute("aria-expanded", "false"); _ltExpandedBtn = null; }
            closeLapTimesSetupPopover();
        }
    });
    document.addEventListener("contextmenu", (e) => {
        const btn = e.target.closest(".lt-setup-btn");
        if (!btn) return;
        e.preventDefault();
        if (_ltExpandedBtn) { _ltExpandedBtn.setAttribute("aria-expanded", "false"); _ltExpandedBtn = null; }
        const id = btn.dataset.ltSid;
        const html = id ? _lapTimesSetupContent.get(id) : null;
        openLapTimesSetupPopover(btn, html || "<p>No setup data.</p>");
        btn.setAttribute("aria-expanded", "true");
        _ltExpandedBtn = btn;
    });
    window.addEventListener("resize", () => {
        const panel = el("lapTimesSetupPanel");
        const open = document.querySelector(".lt-setup-btn[aria-expanded='true']");
        if (panel && !panel.hidden && open) positionLapTimesPopover(open, panel);
    });
}

function isSetupSnapshotSession() {
    const t = lastSessionPacket?.sessionType ?? 0;
    return (t >= 1 && t <= 4) || t === 18;
}

function buildLapTyreCellHtml(lapIdx) {
    const snap = _lapTyreSnapshots[lapIdx];
    if (!snap) return '<span class="lt-tyre-empty">—</span>';
    const visualId = snap.visualTyreCompound;
    const color = COMPOUND_DOT_COLORS[visualId] || "var(--text-dim)";
    const compoundName = VISUAL_COMPOUNDS[visualId] || "";
    const age = snap.tyresAgeLaps ?? 0;
    const wearArr = Array.isArray(snap.tyresWear) ? snap.tyresWear : [];
    let maxWear = 0;
    for (const w of wearArr) if (Number.isFinite(w) && w > maxWear) maxWear = w;
    const wearPct = Math.round(maxWear);
    const title = compoundName ? `${compoundName} — age ${age}L, wear ${wearPct}%` : `Age ${age}L, wear ${wearPct}%`;
    return `<span class="lt-tyre-cell" title="${title}"><span class="lt-tyre-dot" style="background:${color}">${age}</span><span class="lt-tyre-wear">${wearPct}%</span></span>`;
}

function renderLapTimes(tbody, headRow) {
    const hist = sessionHistories[playerCarIndex];
    if (!hist?.lapHistoryDataItems?.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="lt-placeholder">Waiting for lap data…</td></tr>';
        return;
    }
    const showSetup = isSetupSnapshotSession();
    if (headRow) {
        const lastCol = showSetup
            ? '<th class="lt-col-setup" aria-label="Setup"></th>'
            : '<th class="lt-col-tyre">Tyre</th>';
        headRow.innerHTML = '<th class="lt-col-lead">#</th><th>Car</th><th>Lap</th><th>S1</th><th>S2</th><th>S3</th>' + lastCol;
    }

    const eq = lastSessionPacket?.equalCarPerformance;
    const perfIcon = equalPerfTooltipAndIcon(eq);
    const rawTid = participantTeamIds[playerCarIndex];
    const teamIdForColor = (typeof rawTid === "number" && rawTid >= 0) ? rawTid : -1;
    const teamName = teamIdForColor >= 0 ? (TEAM_NAMES[teamIdForColor] || "") : "";

    const laps = hist.lapHistoryDataItems;
    _lapTimesSetupContent.clear();
    _lapTimesSetupIdSeq = 0;
    const parts = [];

    for (let i = 0; i < laps.length; i++) {
        const entry = laps[i];
        if (!entry?.lapTimeInMs) continue;
        const lapInvalid = (entry.lapValidBitFlags & 1) === 0;
        const rowCls = lapInvalid ? "lt-lap-invalid" : "";
        const lapTime = formatTime(entry.lapTimeInMs);
        const s1 = formatTime(sectorMsFromHistoryEntry(entry, 1));
        const s2 = formatTime(sectorMsFromHistoryEntry(entry, 2));
        const s3 = formatTime(sectorMsFromHistoryEntry(entry, 3));

        let lastCellHtml;
        if (showSetup) {
            const snapSetup = _lapSetupSnapshots[i];
            const setupHtml = snapSetup
                ? formatCarSetupPopoverHtml(snapSetup)
                : buildLapTimesSetupHtml(playerCarIndex);
            const sid = registerLapTimesSetup(setupHtml);
            lastCellHtml = `<td><button type="button" class="lt-setup-btn" data-lt-sid="${sid}" title="Setup (click or right‑click)" aria-expanded="false">⋮</button></td>`;
        } else {
            lastCellHtml = `<td class="lt-tyre-td">${buildLapTyreCellHtml(i)}</td>`;
        }

        parts.push(`<tr class="${rowCls}">
            <td>${i + 1}</td>
            <td class="lt-car-cell"><div class="lt-car-inner"><div class="lt-car-meta"><span class="lt-car-name">${escapeXmlText(teamName)}</span></div>${perfIcon}</div></td>
            <td>${lapTime}</td>
            <td>${s1}</td>
            <td>${s2}</td>
            <td>${s3}</td>
            ${lastCellHtml}
        </tr>`);
    }

    tbody.innerHTML = parts.length > 0 ? parts.join("") : '<tr><td colspan="7" class="lt-placeholder">No lap times yet (complete a lap).</td></tr>';
}

function updateTimeTrial(data) {
    lastTimeTrialPacket = data;
}

function updateLapTimesWidget() {
    ensureLapTimesMenuHandlers();
    const tbody = document.getElementById("lapTimesBody");
    if (!tbody) return;
    const headRow = document.getElementById("lapTimesHeadRow");
    renderLapTimes(tbody, headRow);
}

/** PacketCarTelemetry26Data — new in packet format 2026 (F1 26 only). The sole consumer is the
 *  Car Telemetry widget's Straight-Mode (SM) tile, which mirrors Active Aero in place of DRS.
 *  Never fires in a format-2025 session, so the tile stays on its DRS rendering there. */
function updateCarTelemetry26(data) {
    // Property name follows the renamed C# DTO (CarTelemetry26Packet.CarTelemetry26DataItems).
    // Carries the legacy carTelemetry2DataItems fallback for any in-flight cached payloads.
    const items = data && (data.carTelemetry26DataItems || data.carTelemetry2DataItems);
    if (!items) return;
    const idx = (typeof playerCarIndex === "number" && playerCarIndex >= 0) ? playerCarIndex : 0;
    const item = items[idx];
    if (!item) return;

    // Mirror straight mode into the Car Telemetry widget's SM tile (replaces DRS in F1 26).
    playerStraightModeActive = item.activeAeroMode === 1;
    updateDrsSmTile();
}

const PACKET_HANDLERS = {
    Session: updateSession,
    CarTelemetry25: updateCarTelemetry25,
    CarTelemetry26: updateCarTelemetry26,
    CarStatus: updateCarStatus,
    CarSetups: updateCarSetups,
    LapData: updateLapData,
    CarDamage: updateCarDamage,
    Participants: updateParticipants,
    Event: updateEvent,
    TyreSets: updateTyreSets,
    SessionHistory: updateSessionHistory,
    TimeTrial: updateTimeTrial,
};

/** Single SignalR connection shared with app.js (Debug panel subscribes to
 *  DebugPacket through window.__f1TelemetryOnConnection to avoid a second
 *  WebSocket). Handlers registered before the connection exists are queued. */
let _signalRConnection = null;
const _signalRConnectionWaiters = [];

window.__f1TelemetryOnConnection = function (fn) {
    if (typeof fn !== "function") return;
    if (_signalRConnection) fn(_signalRConnection);
    else _signalRConnectionWaiters.push(fn);
};

function initConnection() {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/hub/telemetry")
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    _signalRConnection = connection;
    for (const fn of _signalRConnectionWaiters) {
        try { fn(connection); } catch (e) { console.error(e); }
    }
    _signalRConnectionWaiters.length = 0;

    const statusEl = el("connectionStatus");
    const setConnectionState = (state, label) => {
        statusEl.dataset.state = state;
        statusEl.querySelector(".connection-pill__label").textContent = label;
    };

    connection.on("ReceivePacket", (packetType, header, data) => {
        playerCarIndex = header?.playerCarIndex ?? 0;

        // Session UID is serialized as a JSON string (full uint64 precision); normalize for comparisons.
        const uidRaw = header?.sessionUid;
        const uid = uidRaw !== undefined && uidRaw !== null ? String(uidRaw) : null;
        if (uid != null) {
            if (lastTelemetrySessionUid != null && uid !== lastTelemetrySessionUid) {
                pinnedPenalties = [];
                renderEvents();
                resetTopSpeedSessionState();
                ersDeployPeakJ = 0;
                lastTimeTrialPacket = null;
                lastCarSetupsPacket = null;
                _lapTimesSetupContent.clear();
                _lapTimesSetupIdSeq = 0;
                _lapSetupSnapshots = {};
                _lapTyreSnapshots = {};
                closeLapTimesSetupPopover();
                for (const k in sessionHistories) delete sessionHistories[k];
            }
            lastTelemetrySessionUid = uid;
        }

        const handler = PACKET_HANDLERS[packetType];
        if (handler) {
            if (packetType === "Event") {
                handler(data, header);
            } else {
                handler(data);
            }
        }
    });

    connection.on("ReceiveSetupSnapshot", (carIndex, lapIndex, setup) => {
        if (carIndex === playerCarIndex) {
            _lapSetupSnapshots[lapIndex] = setup;
            scheduleRafUpdate("lapTimes", updateLapTimesWidget);
        }
    });

    connection.on("ReceiveTyreSnapshot", (carIndex, lapIndex, snapshot) => {
        if (carIndex === playerCarIndex) {
            _lapTyreSnapshots[lapIndex] = snapshot;
            scheduleRafUpdate("lapTimes", updateLapTimesWidget);
        }
    });

    connection.onreconnecting(() => {
        setConnectionState("reconnecting", "Reconnecting…");
    });

    connection.onreconnected(() => {
        setConnectionState("connected", "Connected");
        requestCurrentState(connection);
    });

    connection.onclose(() => {
        setConnectionState("offline", "Disconnected");
    });

    connection.start()
        .then(() => {
            setConnectionState("connected", "Connected");
            requestCurrentState(connection);
        })
        .catch(err => {
            console.error("SignalR connection failed:", err);
            setConnectionState("offline", "Connection failed");
        });
}

function requestCurrentState(connection) {
    connection.invoke("GetCurrentState")
        .then(state => {
            if (!state) return;
            for (const [packetType, data] of Object.entries(state)) {
                const handler = PACKET_HANDLERS[packetType];
                if (!handler) continue;
                if (packetType === "Event") {
                    handler(data, {});
                } else {
                    handler(data);
                }
            }
        })
        .catch(err => console.warn("Failed to get current state:", err));

    connection.invoke("GetSetupSnapshots", playerCarIndex)
        .then(snapshots => {
            if (snapshots) {
                _lapSetupSnapshots = snapshots;
                scheduleRafUpdate("lapTimes", updateLapTimesWidget);
            }
        })
        .catch(err => console.warn("Failed to get setup snapshots:", err));

    connection.invoke("GetTyreSnapshots", playerCarIndex)
        .then(snapshots => {
            if (snapshots) {
                _lapTyreSnapshots = snapshots;
                scheduleRafUpdate("lapTimes", updateLapTimesWidget);
            }
        })
        .catch(err => console.warn("Failed to get tyre snapshots:", err));
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof initWidgets === "function") initWidgets();
    ensureTopSpeedLayoutObserver();
    syncRpmBarSegmentWidths(RPM_SCALE_FALLBACK);
    initConnection();
});
