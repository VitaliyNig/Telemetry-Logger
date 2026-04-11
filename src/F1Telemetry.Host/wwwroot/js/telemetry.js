"use strict";

// Справочники синхронизированы с docs/F1_25_UDP_Spec.md (приложения и комментарии к пакетам).

// Track IDs — приложение Track IDs (m_trackId int8, -1 = неизвестно)
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
    41: "Zandvoort (R)"
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

const SAFETY_CAR_STATUS = {
    0: "None", 1: "Full SC", 2: "VSC", 3: "Formation"
};

// m_actualTyreCompound — пакет Car Status (разное для F1 Modern / Classic / F2)
const TYRE_COMPOUNDS = {
    16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
    7: "Inter", 8: "Wet",
    9: "Dry", 10: "Wet",
    11: "Super Soft", 12: "Soft", 13: "Medium", 14: "Hard", 15: "Wet",
};

// m_visualTyreCompound — F1: 16–18,7,8; Classic: как F1; F2: 15 wet, 19–22 (см. спецификацию)
const VISUAL_COMPOUNDS = {
    16: "Soft", 17: "Medium", 18: "Hard", 7: "Inter", 8: "Wet",
    9: "Dry", 10: "Wet",
    15: "Wet", 19: "Super Soft", 20: "Soft", 21: "Medium", 22: "Hard",
};

const TYRE_TEMP_BORDER_DEFAULT = { min: 85, max: 95 };

/** °C по m_visualTyreCompound — ориентир для UI (F1/F2/Classic id из спецификации). */
const TYRE_OPTIMAL_TEMP_C = {
    16: { min: 75, max: 85 },
    17: { min: 75, max: 95 },
    18: { min: 85, max: 95 },
    19: { min: 85, max: 115 },
    20: { min: 95, max: 115 },
    21: { min: 90, max: 115 },
    22: { min: 65, max: 85 },
    7: { min: 55, max: 75 },
    8: { min: 55, max: 65 },
    9: { min: 80, max: 110 },
    10: { min: 55, max: 65 },
    15: { min: 55, max: 75 },
};

const ERS_MODES = { 0: "None", 1: "Medium", 2: "Hotlap", 3: "Overtake" };

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

/** m_teamId — Participants / Lobby / Time Trial */
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
};

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
/** m_teamId per car index (Participants); -1 until loaded. */
let participantTeamIds = [];
let maxEvents = 50;
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
let pitTimesData = {};
let lastLapDataPacket = null;
let lastSessionPacket = null;
const sessionHistories = {};
const GAP_BOARD_LAPS = 4;

/** Max speed (km/h) seen this session per car index (Car Telemetry). */
const sessionTopSpeedByCar = new Array(22).fill(0);
/** Player peak speed on the current lap number (reset when lap advances). */
let playerLapPeakSpeed = 0;
let playerLapPeakForLapNum = 0;
let _topSpeedLayoutObserver = null;
const _topSpeedObservedRoots = new WeakSet();

/** Throttle / brake traces for Car Telemetry pedal chart (0..1 samples, oldest → newest). */
const PEDAL_HISTORY_LEN = 180;
const pedalHistoryT = [];
const pedalHistoryB = [];

/** m_maxRPM from Car Status (rev limiter); 0 until first Car Status for this session. */
let playerMaxRpm = 0;
const RPM_SCALE_FALLBACK = 15000;
/** Absolute RPM thresholds for bar colours (vs current max RPM scale). */
const RPM_BAR_GREEN_END = 11000;
const RPM_BAR_GRADIENT_END = 12000;
let lastSessionLinkId = null;
/** m_visualTyreCompound from Car Status — used for Tyres widget optimal temp ranges. */
let playerVisualTyreCompound = -1;
/** Last player CarTelemetry row — re-apply tyre borders when compound updates. */
let lastPlayerCarTelemetry = null;

function el(id) { return document.getElementById(id); }

/** Tyres widget uses data-* (no duplicate ids when multiple Tyres widgets on grid). */
function forEachTyreWidget(callback) {
    document.querySelectorAll(".tyre-widget").forEach(callback);
}

function getTyreOptimalRange(visualCompoundId) {
    if (visualCompoundId === undefined || visualCompoundId === null || visualCompoundId < 0) {
        return TYRE_TEMP_BORDER_DEFAULT;
    }
    return TYRE_OPTIMAL_TEMP_C[visualCompoundId] || TYRE_TEMP_BORDER_DEFAULT;
}

/** Border by temp vs compound range: blue under, green in range, red over. */
function tyreTempBorderStyle(tempC, visualCompoundId) {
    if (tempC === undefined || tempC === null) {
        return { borderColor: "", borderWidth: "", boxClass: "" };
    }
    const { min, max } = getTyreOptimalRange(visualCompoundId);
    const t = Number(tempC);
    if (!Number.isFinite(t)) {
        return { borderColor: "", borderWidth: "", boxClass: "" };
    }
    if (t < min) {
        return {
            borderColor: "rgba(0, 166, 255, 0.9)",
            borderWidth: "2px",
            boxClass: "tyre-box-temp tyre-box-temp-cold",
        };
    }
    if (t > max) {
        return {
            borderColor: "rgba(225, 6, 0, 0.95)",
            borderWidth: "2px",
            boxClass: "tyre-box-temp tyre-box-temp-hot",
        };
    }
    return {
        borderColor: "rgba(0, 215, 0, 0.85)",
        borderWidth: "2px",
        boxClass: "tyre-box-temp tyre-box-temp-ok",
    };
}

function formatTyreDegCell(v) {
    if (v === undefined || v === null || v === 0) return "--";
    return v + "°";
}

/** Border vs compound band: prefer inner (carcass) when valid, else surface. */
function pickTyreBorderTempC(innerArr, surfaceArr, index) {
    const ti = innerArr?.[index];
    const ts = surfaceArr?.[index];
    if (ti !== undefined && ti !== null && ti > 0) return ti;
    if (ts !== undefined && ts !== null && ts > 0) return ts;
    return null;
}

function setTyreWidgetTemps(car) {
    const inner = car.tyresInnerTemperature;
    const surf = car.tyresSurfaceTemperature;
    if ((!inner || inner.length < 4) && (!surf || surf.length < 4)) return;

    const corners = ["RL", "RR", "FL", "FR"];
    const compoundId = playerVisualTyreCompound;
    forEachTyreWidget(w => {
        for (let i = 0; i < 4; i++) {
            const corner = corners[i];
            const box = w.querySelector(`.tyre-box[data-tyre-corner="${corner}"]`);
            const nodeS = w.querySelector(`.tyre-temp-surface[data-tyre-corner="${corner}"]`);
            const nodeI = w.querySelector(`.tyre-temp-inner[data-tyre-corner="${corner}"]`);
            if (!nodeS || !nodeI) continue;

            const ts = surf?.[i];
            const ti = inner?.[i];
            nodeS.textContent = formatTyreDegCell(ts);
            nodeS.className =
                "tyre-temp-val tyre-temp-surface" +
                (ts !== undefined && ts !== null && ts > 0 ? " " + getTyreTemperatureClass(ts) : "");

            nodeI.textContent = formatTyreDegCell(ti);
            nodeI.className =
                "tyre-temp-val tyre-temp-inner" +
                (ti !== undefined && ti !== null && ti > 0 ? " " + getTyreTemperatureClass(ti) : "");

            const borderT = pickTyreBorderTempC(inner, surf, i);
            if (box) {
                if (borderT === null) {
                    box.classList.remove("tyre-box-temp", "tyre-box-temp-cold", "tyre-box-temp-ok", "tyre-box-temp-hot");
                    box.style.borderWidth = "";
                    box.style.borderColor = "";
                } else {
                    const st = tyreTempBorderStyle(borderT, compoundId);
                    box.classList.remove("tyre-box-temp", "tyre-box-temp-cold", "tyre-box-temp-ok", "tyre-box-temp-hot");
                    if (st.boxClass) {
                        for (const c of st.boxClass.split(" ")) if (c) box.classList.add(c);
                        box.style.borderColor = st.borderColor;
                        box.style.borderWidth = st.borderWidth;
                    } else {
                        box.classList.remove("tyre-box-temp", "tyre-box-temp-cold", "tyre-box-temp-ok", "tyre-box-temp-hot");
                        box.style.borderWidth = "";
                        box.style.borderColor = "";
                    }
                }
            }
        }
    });
}

function tyreWearToPct(wear) {
    const w = Number(wear);
    if (!Number.isFinite(w)) return null;
    return Math.min(100, Math.max(0, w));
}

function formatTyreWearPct(wear) {
    const pct = tyreWearToPct(wear);
    if (pct === null) return "--%";
    return pct.toFixed(0) + "%";
}

const WEAR_STEP_COLORS = [
    "rgba(16, 185, 129, 0.38)",   // 0–9%
    "rgba(34, 197, 94, 0.38)",    // 10–19%
    "rgba(132, 204, 22, 0.38)",   // 20–29%
    "rgba(234, 179, 8, 0.38)",    // 30–39%
    "rgba(245, 158, 11, 0.38)",   // 40–49%
    "rgba(249, 115, 22, 0.40)",   // 50–59%
    "rgba(239, 68, 68, 0.40)",    // 60–69%
    "rgba(220, 38, 38, 0.42)",    // 70–79%
    "rgba(185, 28, 28, 0.45)",    // 80–89%
    "rgba(153, 27, 27, 0.50)",    // 90–100%
];

function tyreWearBackground(pct) {
    const idx = Math.min(WEAR_STEP_COLORS.length - 1, Math.max(0, Math.floor(pct / 10)));
    return WEAR_STEP_COLORS[idx];
}

function resetTyreBoxWearStyling(box) {
    box.classList.remove("tyre-box-wear");
    box.style.background = "";
}

function setTyreWidgetWear(car) {
    const wear = car?.tyresDamage;
    const corners = ["RL", "RR", "FL", "FR"];
    forEachTyreWidget(widgetRoot => {
        for (let i = 0; i < 4; i++) {
            const corner = corners[i];
            const box = widgetRoot.querySelector(`.tyre-box[data-tyre-corner="${corner}"]`);
            const node = widgetRoot.querySelector(`.tyre-wear[data-tyre-corner="${corner}"]`);
            if (!box || !node) continue;

            if (!wear || wear.length <= i) {
                node.textContent = "--%";
                resetTyreBoxWearStyling(box);
                continue;
            }

            node.textContent = formatTyreWearPct(wear[i]);
            const pct = tyreWearToPct(wear[i]);
            if (pct === null) {
                resetTyreBoxWearStyling(box);
                continue;
            }
            box.classList.add("tyre-box-wear");
            box.style.background = tyreWearBackground(pct);
        }
    });
}

function setTyreWidgetCompoundAge(car) {
    if (!car) return;
    const compound = VISUAL_COMPOUNDS[car.visualTyreCompound] || `ID:${car.visualTyreCompound}`;
    const age = car.tyresAgeLaps + " laps";
    forEachTyreWidget(w => {
        const c = w.querySelector("[data-tyre-compound]");
        const a = w.querySelector("[data-tyre-age]");
        if (c) c.textContent = compound;
        if (a) a.textContent = age;
    });
}

/** Grey track; clipped fill: green 0..11k, gradient 11k..12k, solid red 12k..max. */
function syncRpmBarSegmentWidths(scale) {
    const s = scale > 0 ? scale : RPM_SCALE_FALLBACK;
    const greenEnd = Math.min(RPM_BAR_GREEN_END, s);
    const gradEnd = Math.min(RPM_BAR_GRADIENT_END, s);
    const wGreen = greenEnd;
    const wGradient = Math.max(0, gradEnd - greenEnd);
    const wRed = Math.max(0, s - Math.min(RPM_BAR_GRADIENT_END, s));
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

function formatSectorTime(msPart, minutesPart) {
    if (msPart === 0 && minutesPart === 0) return "--";
    const totalMs = minutesPart * 60000 + msPart;
    return formatTime(totalMs);
}

function getTyreTemperatureClass(temp) {
    if (temp < 60) return "temp-cold";
    if (temp <= 100) return "temp-optimal";
    if (temp <= 120) return "temp-hot";
    return "temp-critical";
}

function setDamageBar(elId, pct) {
    const bar = el(elId);
    if (!bar) return;
    bar.style.width = pct + "%";
    if (pct > 50) bar.style.background = "var(--danger)";
    else if (pct > 25) bar.style.background = "var(--warning)";
    else bar.style.background = "var(--safe)";
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
    const deltaAbs = Math.abs(trend.delta);
    const deltaText = deltaAbs > 0 ? ` (${trend.delta > 0 ? "+" : ""}${trend.delta}°)` : "";
    e.innerHTML = `${temp}°C <span class="temp-trend ${trend.cls}">${trend.arrow}${deltaText}</span>`;
}

function resetTopSpeedSessionState() {
    sessionTopSpeedByCar.fill(0);
    playerLapPeakSpeed = 0;
    playerLapPeakForLapNum = 0;
    updateTopSpeedWidgets();
}

function updateSession(data) {
    lastSessionPacket = data;

    const linkId = data.sessionLinkIdentifier;
    if (linkId !== undefined && linkId !== null) {
        if (lastSessionLinkId !== null && linkId !== lastSessionLinkId) {
            playerMaxRpm = 0;
            playerVisualTyreCompound = -1;
            lastPlayerCarTelemetry = null;
            pedalHistoryT.length = 0;
            pedalHistoryB.length = 0;
        }
        lastSessionLinkId = linkId;
    }

    el("trackName").textContent = TRACK_NAMES[data.trackId] || `Track ${data.trackId}`;
    el("sessionType").textContent = SESSION_TYPES[data.sessionType] || `Type ${data.sessionType}`;
    el("weather").textContent = WEATHER_NAMES[data.weather] || "Unknown";

    if (data.trackId !== currentTrackId) {
        currentTrackId = data.trackId;
        const pitInput = el("pitTimeInput");
        if (pitInput) pitInput.value = getPitTimeForTrack(currentTrackId).toFixed(1);
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

    updateWeatherForecast(data);

    el("safetyCarStatus").textContent = SAFETY_CAR_STATUS[data.safetyCarStatus] || "None";
    el("totalLaps").textContent = data.totalLaps > 0 ? data.totalLaps : "--";

    const timeLeftSec = data.sessionTimeLeft;
    if (timeLeftSec > 0) {
        const m = Math.floor(timeLeftSec / 60);
        const s = timeLeftSec % 60;
        el("timeLeft").textContent = `${m}:${String(s).padStart(2, "0")}`;
    } else {
        el("timeLeft").textContent = "--";
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
        container.innerHTML = '<div class="weather-placeholder">No forecast data available</div>';
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
        container.innerHTML = '<div class="weather-placeholder">No forecast for current session</div>';
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

function updateCarTelemetry(data) {
    const cars = data.carTelemetryData;
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
                playerLapPeakForLapNum = ln;
                playerLapPeakSpeed = 0;
            }
            const psp = Number(playerCar.speed) || 0;
            if (psp > playerLapPeakSpeed) playerLapPeakSpeed = psp;
        }
        updateTopSpeedWidgets();
    }

    const car = data.carTelemetryData?.[playerCarIndex];
    if (!car) return;

    el("speed").textContent = car.speed;
    const gear = car.gear;
    el("gear").textContent = gear === -1 ? "R" : gear === 0 ? "N" : gear.toString();

    const scale = playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK;
    syncRpmBarSegmentWidths(scale);
    const rpmPct = Math.min(100, (car.engineRpm / scale) * 100);
    const rpmClip = el("rpmBarClip");
    if (rpmClip) rpmClip.style.setProperty("--rpm-pct", `${rpmPct}%`);
    el("rpmValue").textContent = `${car.engineRpm} / ${scale} RPM`;

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
    updatePedalChart();

    const drsEl = el("drsIndicator");
    if (drsEl) {
        drsEl.textContent = "DRS";
        if (car.drs === 1) drsEl.classList.add("active");
        else drsEl.classList.remove("active");
    }

    lastPlayerCarTelemetry = car;
    // Tyre temps: RL, RR, FL, FR (see F1 UDP appendix); inner temp fallback if surface is 0
    setTyreWidgetTemps(car);
}

function updateCarStatus(data) {
    const car = data.carStatusDataItems?.[playerCarIndex];
    if (!car) return;

    if (car.maxRpm > 0) {
        playerMaxRpm = car.maxRpm;
    }

    syncRpmBarSegmentWidths(playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK);

    const prevCompound = playerVisualTyreCompound;
    if (car.visualTyreCompound !== undefined && car.visualTyreCompound !== null) {
        playerVisualTyreCompound = car.visualTyreCompound;
    }
    if (prevCompound !== playerVisualTyreCompound && lastPlayerCarTelemetry) {
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

    const fuelRem = el("fuelRemaining");
    if (fuelRem) fuelRem.textContent = car.fuelInTank.toFixed(1) + " kg";
    const fuelLaps = el("fuelLaps");
    if (fuelLaps) fuelLaps.textContent = car.fuelRemainingLaps.toFixed(1) + " laps";
    const ersMode = el("ersMode");
    if (ersMode) ersMode.textContent = ERS_MODES[car.ersDeployMode] || "--";

    const ersBar = el("ersBar");
    if (ersBar) {
        const maxErs = 4000000;
        const ersPct = Math.min(100, (car.ersStoreEnergy / maxErs) * 100);
        ersBar.style.width = ersPct + "%";
    }

    setTyreWidgetCompoundAge(car);
}

function updateCarSetups(data) {
    const setup = data.carSetupData?.[playerCarIndex];
    const diffEl = el("diffOnThrottleValue");
    if (!diffEl) return;
    if (!setup || setup.onThrottle === undefined || setup.onThrottle === null) {
        diffEl.textContent = "--";
        return;
    }
    diffEl.textContent = `${setup.onThrottle}%`;
}

function updateLapData(data) {
    lastLapDataPacket = data;
    const car = data.lapDataItems?.[playerCarIndex];
    if (!car) return;

    const ln = car.currentLapNum;
    if (ln !== undefined && ln !== null && ln !== playerLapPeakForLapNum) {
        playerLapPeakForLapNum = ln;
        playerLapPeakSpeed = 0;
        updateTopSpeedWidgets();
    }

    el("position").textContent = car.carPosition || "--";
    el("currentLap").textContent = car.currentLapNum || "--";
    el("currentLapTime").textContent = formatTime(car.currentLapTimeInMs);
    el("lastLapTime").textContent = formatTime(car.lastLapTimeInMs);
    el("sector1").textContent = formatSectorTime(car.sector1TimeMsPart, car.sector1TimeMinutesPart);
    el("sector2").textContent = formatSectorTime(car.sector2TimeMsPart, car.sector2TimeMinutesPart);

    updateStandings(data);
    updateQualiStandings();
    updatePitPredictor();
    updateGapBoard();
}

function updateCarDamage(data) {
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
    if (data.participants) {
        for (let i = 0; i < data.participants.length; i++) {
            const p = data.participants[i];
            participantNames[i] = p?.name || `Car ${i}`;
            const tid = p?.teamId;
            participantTeamIds[i] = tid !== undefined && tid !== null ? tid : -1;
        }
    }
    updateTopSpeedWidgets();
}

function formatSpeedKmh(v) {
    if (!v || v <= 0) return "--";
    return Math.round(v).toString();
}

function getPlayerTeamId() {
    const t = participantTeamIds[playerCarIndex];
    return t !== undefined && t !== null && t >= 0 ? t : -1;
}

function getSessionBestAmongTeammates() {
    const teamId = getPlayerTeamId();
    if (teamId < 0) return 0;
    let best = 0;
    for (let i = 0; i < sessionTopSpeedByCar.length; i++) {
        if (participantTeamIds[i] !== teamId) continue;
        const s = sessionTopSpeedByCar[i];
        if (s > best) best = s;
    }
    return best;
}

function applyTopSpeedLayoutMode(root, compact) {
    if (!root) return;
    root.classList.toggle("ts-compact", compact);
}

function refreshTopSpeedLayoutModes() {
    document.querySelectorAll("[data-ts-widget]").forEach(root => {
        const w = root.clientWidth;
        applyTopSpeedLayoutMode(root, w > 0 && w < 280);
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

    body.innerHTML = rows.map((r, i) => {
        const rowCls = r.isPlayer ? "ts-lb-row player-row" : "ts-lb-row";
        return `<div class="${rowCls}">
            <span class="ts-lb-rank">${i + 1}</span>
            <span class="ts-lb-name" title="${r.name}">${r.name}</span>
            <span class="ts-lb-speed">${formatSpeedKmh(r.speed)}</span>
        </div>`;
    }).join("");
}

function updateTopSpeedCompareWidget() {
    const sessionEl = el("topSpeedSessionBest");
    const lapEl = el("topSpeedLapPeak");
    const deltaEl = el("topSpeedCompareDelta");
    if (!sessionEl || !lapEl || !deltaEl) return;

    const teamBest = getSessionBestAmongTeammates();
    sessionEl.textContent = teamBest > 0 ? formatSpeedKmh(teamBest) : "--";

    const lapPeak = playerLapPeakSpeed;
    lapEl.textContent = lapPeak > 0 ? formatSpeedKmh(lapPeak) : "--";

    if (teamBest <= 0 || lapPeak <= 0) {
        deltaEl.textContent = "--";
        deltaEl.className = "ts-compare-delta";
        return;
    }
    const d = lapPeak - teamBest;
    const abs = Math.abs(Math.round(d));
    if (d > 0) {
        deltaEl.textContent = `+${abs} vs team session best`;
        deltaEl.className = "ts-compare-delta ts-delta-up";
    } else if (d < 0) {
        deltaEl.textContent = `−${abs} vs team session best`;
        deltaEl.className = "ts-compare-delta ts-delta-down";
    } else {
        deltaEl.textContent = "Matches team session best";
        deltaEl.className = "ts-compare-delta ts-delta-even";
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
            if (d.lapTime) detail += ` ${d.lapTime.toFixed(3)}s`;
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

    const time = header?.sessionTime?.toFixed(1) || "--";
    const entry = { code, name, detail, time, isPenalty, vehicleIdx, penaltyType };

    if (code === "PENA" && PINNABLE_PENALTY_TYPES.has(penaltyType)) {
        pinnedPenalties.unshift(entry);
    }

    if (code === "DTSV" || code === "SGSV") {
        entry.served = true;
    }

    events.unshift(entry);
    if (events.length > maxEvents) events.length = maxEvents;
    renderEvents();
}

function renderEventItem(e, pinned) {
    const isSeriousPenalty = e.code === "PENA" && PINNABLE_PENALTY_TYPES.has(e.penaltyType);

    let cls = "event-item";
    if (pinned) cls += " penalty-serious pinned";
    else if (isSeriousPenalty) cls += " penalty-serious";

    const codeColor = EVENT_CODE_COLORS[e.code] || "var(--accent-blue)";
    const icon = pinned ? '<span class="pin-icon">&#128204;</span> ' : "";
    const servedBadge = e.served ? ' <span class="served-badge">SERVED</span>' : "";
    return `<div class="${cls}">
        <span class="event-code" style="color:${codeColor}">${icon}${e.code}</span>
        <span class="event-detail">${e.name}${e.detail ? " — " + e.detail : ""}${servedBadge}</span>
        <span class="event-time">${e.time}s</span>
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
        if (ld.resultStatus < 2) continue; // inactive
        rows.push({
            idx: i,
            pos: ld.carPosition,
            name: participantNames[i] || `Car ${i}`,
            lap: ld.currentLapNum,
            lastLap: formatTime(ld.lastLapTimeInMs),
            gapMs: ld.deltaToRaceLeaderMinutesPart * 60000 + ld.deltaToRaceLeaderMsPart,
            pitStatus: PIT_STATUS[ld.pitStatus] || "",
            isPlayer: i === playerCarIndex,
        });
    }

    rows.sort((a, b) => a.pos - b.pos);

    const tbody = el("standingsBody");
    tbody.innerHTML = rows.map(r => {
        const gap = r.pos === 1 ? "Leader" : formatTime(r.gapMs);
        return `<tr class="${r.isPlayer ? "player-row" : ""}">
            <td>${r.pos}</td>
            <td>${r.name}</td>
            <td>${r.lap}</td>
            <td>${r.lastLap}</td>
            <td>${gap}</td>
            <td class="pit-status">${r.pitStatus}</td>
        </tr>`;
    }).join("");
}

function getVisualCompoundInfo(visualId) {
    const map = {
        16: { name: "Soft", css: "compound-soft", dot: "#ff3333" },
        17: { name: "Medium", css: "compound-medium", dot: "#ffd700" },
        18: { name: "Hard", css: "compound-hard", dot: "#e0e0e0" },
        7: { name: "Inter", css: "compound-inter", dot: "#00cc00" },
        8: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
        9: { name: "Dry", css: "compound-hard", dot: "#c0c0c0" },
        10: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
        15: { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
        19: { name: "Super Soft", css: "compound-soft", dot: "#ff6633" },
        20: { name: "Soft", css: "compound-soft", dot: "#ff3333" },
        21: { name: "Medium", css: "compound-medium", dot: "#ffd700" },
        22: { name: "Hard", css: "compound-hard", dot: "#e0e0e0" },
    };
    return map[visualId] || { name: `ID:${visualId}`, css: "", dot: "#888" };
}

function updateTyreSets(data) {
    if (data.carIdx !== playerCarIndex) return;

    const sets = data.tyreSetDataItems;
    const fittedIdx = data.fittedIdx;
    if (!sets || sets.length === 0) return;

    const groups = {};
    for (let i = 0; i < sets.length; i++) {
        const s = sets[i];
        const info = getVisualCompoundInfo(s.visualTyreCompound);
        const key = info.name;
        if (!groups[key]) groups[key] = { info, items: [] };
        groups[key].items.push({ ...s, idx: i, isFitted: i === fittedIdx, compoundInfo: info });
    }

    const fittedSet = sets[fittedIdx];
    const fittedInfo = fittedSet ? getVisualCompoundInfo(fittedSet.visualTyreCompound) : null;
    const fittedEl = el("fittedCompound");
    if (fittedInfo) {
        fittedEl.innerHTML = `<span style="color:${fittedInfo.dot}">●</span> ${fittedInfo.name} (${fittedSet.wear}% wear, ${fittedSet.lifeSpan} laps left)`;
    }

    const container = el("tyreSetGroups");
    const order = ["Super Soft", "Soft", "Medium", "Hard", "Dry", "Inter", "Wet"];
    let html = "";

    for (const groupName of order) {
        const g = groups[groupName];
        if (!g) continue;
        html += `<div class="tyreset-group">`;
        html += `<div class="tyreset-group-title ${g.info.css}">${groupName} (${g.items.filter(x => x.available).length} avail.)</div>`;
        for (const s of g.items) {
            const wearPct = s.wear;
            const isFitted = s.isFitted;
            const available = s.available;
            const cls = isFitted ? "tyreset-item fitted" : available ? "tyreset-item" : "tyreset-item unavailable";
            const wearColor = wearPct > 60 ? "var(--danger)" : wearPct > 30 ? "var(--warning)" : "var(--safe)";
            const delta = s.lapDeltaTime;
            const deltaSign = delta > 0 ? "+" : "";
            const deltaCls = delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
            const deltaText = delta !== 0 ? `${deltaSign}${(delta / 1000).toFixed(1)}s` : "base";
            const tag = isFitted ? ' <span style="color:var(--accent-brand);font-weight:700;">FIT</span>' : "";
            html += `<div class="${cls}">`;
            html += `<span class="tyreset-compound-dot" style="background:${s.compoundInfo.dot}"></span>`;
            html += `<div class="tyreset-wear-bar"><div class="tyreset-wear-fill" style="width:${100 - wearPct}%;background:${wearColor}"></div></div>`;
            html += `<span class="tyreset-detail">${wearPct}% worn${tag}</span>`;
            html += `<span class="tyreset-life">${s.lifeSpan}L / ${s.usableLife}L</span>`;
            html += `<span class="tyreset-delta ${deltaCls}">${deltaText}</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    container.innerHTML = html || '<div class="tyreset-placeholder">No tyre sets available</div>';
}

async function loadPitTimes() {
    try {
        const resp = await fetch("/api/pit-times");
        if (resp.ok) pitTimesData = await resp.json();
    } catch (e) {
        console.warn("Failed to load pit times:", e);
    }
}

function getPitTimeForTrack(trackId) {
    const entry = pitTimesData[String(trackId)];
    if (entry && entry.pitTimeSec) return entry.pitTimeSec;
    return 23.0;
}

function updatePitPredictor() {
    if (!lastLapDataPacket) return;
    const items = lastLapDataPacket.lapDataItems;
    if (!items) return;

    const playerLap = items[playerCarIndex];
    if (!playerLap || playerLap.resultStatus < 2) return;

    const pitTimeSec = parseFloat(el("pitTimeInput").value) || getPitTimeForTrack(currentTrackId);
    const pitTimeMs = pitTimeSec * 1000;

    const sorted = [];
    for (let i = 0; i < items.length; i++) {
        const ld = items[i];
        if (ld.resultStatus < 2) continue;
        const gapToLeaderMs = ld.deltaToRaceLeaderMinutesPart * 60000 + ld.deltaToRaceLeaderMsPart;
        sorted.push({
            idx: i,
            pos: ld.carPosition,
            gapToLeaderMs,
            name: participantNames[i] || `Car ${i}`,
            isPlayer: i === playerCarIndex,
            pitStatus: ld.pitStatus,
        });
    }
    sorted.sort((a, b) => a.pos - b.pos);

    const playerEntry = sorted.find(r => r.isPlayer);
    if (!playerEntry) return;

    const playerGapAfterPit = playerEntry.gapToLeaderMs + pitTimeMs;

    let predictedPos = 1;
    for (const r of sorted) {
        if (r.isPlayer) continue;
        if (r.gapToLeaderMs < playerGapAfterPit) {
            predictedPos++;
        }
    }

    el("pitPredPos").textContent = predictedPos;

    let carAhead = null;
    let carBehind = null;
    const positionsAfterPit = sorted
        .filter(r => !r.isPlayer)
        .map(r => ({ ...r, effectiveGap: r.gapToLeaderMs }))
        .concat([{ ...playerEntry, effectiveGap: playerGapAfterPit, isPlayer: true }])
        .sort((a, b) => a.effectiveGap - b.effectiveGap);

    const playerIdx = positionsAfterPit.findIndex(r => r.isPlayer);
    if (playerIdx > 0) {
        const ahead = positionsAfterPit[playerIdx - 1];
        carAhead = {
            name: ahead.name,
            gapMs: playerGapAfterPit - ahead.effectiveGap,
        };
    }
    if (playerIdx < positionsAfterPit.length - 1) {
        const behind = positionsAfterPit[playerIdx + 1];
        carBehind = {
            name: behind.name,
            gapMs: behind.effectiveGap - playerGapAfterPit,
        };
    }

    if (carAhead) {
        el("pitAheadName").textContent = carAhead.name;
        el("pitAheadGap").textContent = `+${(carAhead.gapMs / 1000).toFixed(1)}s`;
    } else {
        el("pitAheadName").textContent = "Leader";
        el("pitAheadGap").textContent = "--";
    }

    if (carBehind) {
        el("pitBehindName").textContent = carBehind.name;
        el("pitBehindGap").textContent = `-${(carBehind.gapMs / 1000).toFixed(1)}s`;
    } else {
        el("pitBehindName").textContent = "No car behind";
        el("pitBehindGap").textContent = "--";
    }
}

async function savePitTime() {
    const val = parseFloat(el("pitTimeInput").value);
    if (!val || val <= 0 || currentTrackId < 0) return;
    const trackName = TRACK_NAMES[currentTrackId] || `Track ${currentTrackId}`;
    try {
        const resp = await fetch(`/api/pit-times/${currentTrackId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trackName, pitTimeSec: val }),
        });
        if (resp.ok) {
            pitTimesData[String(currentTrackId)] = { trackName, pitTimeSec: val };
            el("pitSaveStatus").textContent = "Saved!";
            setTimeout(() => { el("pitSaveStatus").textContent = ""; }, 2000);
        }
    } catch (e) {
        console.warn("Failed to save pit time:", e);
    }
}

function updateSessionHistory(data) {
    sessionHistories[data.carIdx] = data;
    updateGapBoard();
    updateQualiStandings();
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

        return `<tr class="${rowCls}">
            <td>${pos}</td>
            <td>${r.name}</td>
            <td>${bestLap}</td>
            <td class="qs-gap">${gap}</td>
            <td>${r.status.label === "Flying" ? "L" + (lastLapDataPacket.lapDataItems[r.idx]?.currentLapNum || "") : "--"}</td>
            <td>${statusBadge}${invalidMark}</td>
            <td class="qs-sector">${s1Html}</td>
            <td class="qs-sector">${s2Html}</td>
            <td class="qs-sector">${s3Html}</td>
        </tr>`;
    }).join("");
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
                return { text: (deltaMs / 1000).toFixed(3), cls: "gap-cell-faster" };
            } else if (deltaMs > 0) {
                return { text: "+" + (deltaMs / 1000).toFixed(3), cls: "gap-cell-slower" };
            }
            return { text: formatTime(timeMs), cls: "" };
        }

        return { text: formatTime(timeMs), cls: "" };
    }

    let html = '<table class="gap-table">';
    html += '<thead><tr><th class="gap-hdr-label">LAST ' + lapColumns.length + ' LAPS</th>';
    for (const lapIdx of lapColumns) {
        html += `<th>LAP ${lapIdx + 1}</th>`;
    }
    html += '</tr></thead><tbody>';

    for (const driver of chosen) {
        const rowCls = driver.isPlayer ? "gap-row-player" : "";
        const posColor = driver.isPlayer ? "gap-pos-player" : "";
        html += `<tr class="${rowCls}">`;
        html += `<td class="gap-driver-cell"><span class="gap-pos ${posColor}">${driver.pos}</span> <span class="gap-driver-name">${driver.name}</span></td>`;
        for (const lapIdx of lapColumns) {
            const cell = formatLapCell(driver.idx, lapIdx, driver.isPlayer);
            html += `<td class="gap-time-cell ${cell.cls}">${cell.text}</td>`;
        }
        html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

const PACKET_HANDLERS = {
    Session: updateSession,
    CarTelemetry: updateCarTelemetry,
    CarStatus: updateCarStatus,
    CarSetups: updateCarSetups,
    LapData: updateLapData,
    CarDamage: updateCarDamage,
    Participants: updateParticipants,
    Event: updateEvent,
    TyreSets: updateTyreSets,
    SessionHistory: updateSessionHistory,
};

function initConnection() {
    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/hub/telemetry")
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

    const statusEl = el("connectionStatus");

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

    connection.onreconnecting(() => {
        statusEl.className = "connection-status";
        statusEl.querySelector(".status-text").textContent = "Reconnecting...";
    });

    connection.onreconnected(() => {
        statusEl.className = "connection-status connected";
        statusEl.querySelector(".status-text").textContent = "Connected";
        requestCurrentState(connection);
    });

    connection.onclose(() => {
        statusEl.className = "connection-status disconnected";
        statusEl.querySelector(".status-text").textContent = "Disconnected";
    });

    connection.start()
        .then(() => {
            statusEl.className = "connection-status connected";
            statusEl.querySelector(".status-text").textContent = "Connected";
            requestCurrentState(connection);
        })
        .catch(err => {
            console.error("SignalR connection failed:", err);
            statusEl.className = "connection-status disconnected";
            statusEl.querySelector(".status-text").textContent = "Connection failed";
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
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof initWidgets === "function") initWidgets();
    ensureTopSpeedLayoutObserver();
    syncRpmBarSegmentWidths(RPM_SCALE_FALLBACK);
    await loadPitTimes();
    initConnection();
});
