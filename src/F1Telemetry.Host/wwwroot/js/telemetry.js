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
    19: "#ff3333", 20: "#ffd700", 21: "#e0e0e0", 22: "#e0e0e0",
};

const ACTUAL_COMPOUND_TEMP = {
    20: { min: 90, opt: 100, max: 115 },
    19: { min: 85, opt: 95, max: 115 },
    18: { min: 80, opt: 90, max: 105 },
    17: { min: 75, opt: 85, max: 100 },
    16: { min: 70, opt: 80, max: 90 },
    22: { min: 65, opt: 75, max: 85 },
    7:  { min: 60, opt: 70, max: 80 },
    8:  { min: 50, opt: 60, max: 70 },
};
const ACTUAL_COMPOUND_TEMP_DEFAULT = { min: 80, opt: 90, max: 105 };

const TEMP_COLORS = { cold: "#00a6ff", normal: "#22c55e", hot: "#eab308", critical: "#ef4444" };

function getCompoundTempRange(actualCompoundId) {
    return ACTUAL_COMPOUND_TEMP[actualCompoundId] || ACTUAL_COMPOUND_TEMP_DEFAULT;
}

function tyreTempColor(temp, range) {
    if (!range) range = ACTUAL_COMPOUND_TEMP_DEFAULT;
    const t = Number(temp);
    if (!Number.isFinite(t) || t <= 0) return null;
    if (t < range.min) return TEMP_COLORS.cold;
    if (t < range.opt) return TEMP_COLORS.normal;
    if (t <= range.max) return TEMP_COLORS.hot;
    return TEMP_COLORS.critical;
}

function tyreTempColorAlpha(temp, range, alpha) {
    const hex = tyreTempColor(temp, range);
    if (!hex) return null;
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
}

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

/** Accent for Gap Ring name colour (teamId → hex) */
const TEAM_ACCENT_COLORS = {
    0: "#00d2be", 1: "#e10600", 2: "#3671c6", 3: "#64c4ff", 4: "#229971",
    5: "#ff8700", 6: "#6692ff", 7: "#b6babd", 8: "#ff8000", 9: "#52e252",
    41: "#a8a8a8", 104: "#c0c0c0", 129: "#805eec", 142: "#e8e8e8", 154: "#e8e8e8",
    185: "#00d2be", 186: "#e10600", 187: "#3671c6", 188: "#64c4ff", 189: "#229971",
    190: "#ff8700", 191: "#6692ff", 192: "#b6babd", 193: "#ff8000", 194: "#52e252",
};

function teamAccentColor(teamId) {
    if (teamId == null || teamId < 0) return "#94a3b8";
    return TEAM_ACCENT_COLORS[teamId] || "#94a3b8";
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

let _pitTimesPanel = null;
let _pitTimesPanelDocCloseBound = false;

function closePitTimesPanel() {
    if (_pitTimesPanel) {
        _pitTimesPanel.remove();
        _pitTimesPanel = null;
    }
}

function syncMainPitInputFromTrack() {
    const pitInput = el("pitTimeInput");
    if (!pitInput || typeof getPitTimeForTrack !== "function" || typeof currentTrackId === "undefined") return;
    pitInput.value = getPitTimeForTrack(currentTrackId).toFixed(1);
}

async function saveAllPitTimesFromPanel(panel, statusEl) {
    const inputs = [...panel.querySelectorAll("input[data-track-id]")];
    let ok = 0;
    let fail = 0;
    for (const inp of inputs) {
        const tid = inp.dataset.trackId;
        const val = parseFloat(inp.value);
        if (!Number.isFinite(val) || val <= 0) continue;
        const trackName = TRACK_NAMES[Number(tid)] || `Track ${tid}`;
        try {
            const resp = await fetch(`/api/pit-times/${tid}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trackName, pitTimeSec: val }),
            });
            if (resp.ok) {
                pitTimesData[tid] = { trackName, pitTimeSec: val };
                ok++;
            } else {
                fail++;
            }
        } catch (_) {
            fail++;
        }
    }
    if (statusEl) {
        if (fail === 0 && ok > 0) statusEl.textContent = "Saved";
        else if (ok > 0 && fail > 0) statusEl.textContent = "Partial save";
        else if (ok === 0 && fail > 0) statusEl.textContent = "Save failed";
        else statusEl.textContent = "";
        setTimeout(() => { statusEl.textContent = ""; }, 2800);
    }
    syncMainPitInputFromTrack();
    if (typeof updatePitPredictor === "function") updatePitPredictor();
}

function initPitTimesPanel() {
    const btn = document.getElementById("btnPitTimesSettings");
    if (!btn || btn.dataset.pitTimesWired === "1") return;
    btn.dataset.pitTimesWired = "1";

    btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (_pitTimesPanel) {
            closePitTimesPanel();
            return;
        }

        try {
            await loadPitTimes();
        } catch (_) { /* ignore */ }

        const panel = document.createElement("div");
        panel.className = "pit-times-panel";
        _pitTimesPanel = panel;

        const trackIds = Object.keys(TRACK_NAMES).map(Number).sort((a, b) => a - b);
        let html = '<div class="pit-times-panel-header">Pit lane loss (seconds)</div>'
            + '<div class="pit-times-list">';
        for (const id of trackIds) {
            const name = TRACK_NAMES[id];
            const sec = getPitTimeForTrack(id);
            const curCls = id === currentTrackId ? " pit-times-row-current" : "";
            const escTitle = name.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
            html += `<div class="pit-times-row${curCls}"><span class="pit-times-track" title="${escTitle}">${name}</span>`
                + `<input type="number" class="pit-times-input" data-track-id="${id}" step="0.1" min="12" max="50" value="${sec.toFixed(1)}"></div>`;
        }
        html += "</div>";
        html += "<div class=\"pit-times-footer\"><span class=\"pit-times-save-status\" id=\"pitTimesBulkStatus\"></span>"
            + "<button type=\"button\" class=\"btn btn-small btn-primary\" id=\"btnPitTimesSaveAll\">Save all</button></div>";
        panel.innerHTML = html;

        document.body.appendChild(panel);

        const rect = btn.getBoundingClientRect();
        panel.style.top = (rect.bottom + 4) + "px";
        const pw = panel.offsetWidth;
        let left = Math.max(4, rect.right - pw);
        if (left + pw > window.innerWidth - 4) left = window.innerWidth - pw - 4;
        panel.style.left = left + "px";

        panel.addEventListener("click", (ev) => ev.stopPropagation());

        panel.querySelector("#btnPitTimesSaveAll")?.addEventListener("click", async () => {
            const st = panel.querySelector("#pitTimesBulkStatus");
            if (st) st.textContent = "…";
            await saveAllPitTimesFromPanel(panel, st);
        });

        if (!_pitTimesPanelDocCloseBound) {
            _pitTimesPanelDocCloseBound = true;
            document.addEventListener("click", (ev) => {
                if (!_pitTimesPanel) return;
                const b = document.getElementById("btnPitTimesSettings");
                if (b && (ev.target === b || b.contains(ev.target))) return;
                if (_pitTimesPanel.contains(ev.target)) return;
                closePitTimesPanel();
            });
        }
    });
}

let _tyreInfoPanel = null;

function initTyreInfoTooltip() {
    document.querySelectorAll(".tyre-info-btn").forEach(btn => {
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
    panel.innerHTML =
        `<div class="tip-section"><div class="tip-title">Legend</div>` +
        `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="#ef4444" stroke-width="2" fill="none"/></svg><span>Border = Surface temp</span></div>` +
        `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="#22c55e" stroke-opacity="0.35" stroke-width="1.5" fill="#22c55e"/></svg><span>Fill = Carcass temp</span></div>` +
        `<div class="tip-row"><svg class="tl-ico" viewBox="0 0 14 14"><rect x="1.5" y="1.5" width="11" height="11" rx="2" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" fill="none"/><rect x="1.5" y="8" width="11" height="5.5" rx="0 0 2 2" fill="#b45309" opacity="0.7"/></svg><span>Level = Wear</span></div></div>` +
        `<div class="tip-section"><div class="tip-title">Temperature scale</div>` +
        `<div class="tip-scale">` +
        `<span class="tip-zone" style="background:#00a6ff">Cold</span>` +
        `<span class="tip-zone" style="background:#22c55e">Normal</span>` +
        `<span class="tip-zone" style="background:#eab308">Hot</span>` +
        `<span class="tip-zone" style="background:#ef4444">Overheat</span>` +
        `</div>` +
        `<div class="tip-desc">< min&ensp;·&ensp;min – opt&ensp;·&ensp;opt – max&ensp;·&ensp;> max</div></div>`;

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
let pitTimesData = {};
let lastLapDataPacket = null;
let lastSessionPacket = null;
/** Max lapDistance (m) seen this session — fallback when trackLength missing */
let gapRingObservedMaxLapDist = 0;
const sessionHistories = {};
const GAP_BOARD_LAPS = 4;

/** Max speed (km/h) seen this session per car index (Car Telemetry). */
const sessionTopSpeedByCar = new Array(22).fill(0);
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
/** Absolute RPM thresholds for bar colours (vs current max RPM scale). */
const RPM_BAR_GREEN_END = 11000;
const RPM_BAR_GRADIENT_END = 12000;
let lastSessionLinkId = null;
let playerVisualTyreCompound = -1;
let playerActualTyreCompound = -1;
let lastPlayerCarTelemetry = null;

function el(id) { return document.getElementById(id); }

function setText(id, text) {
    const e = el(id);
    if (e) e.textContent = text;
}

function setHtml(id, html) {
    const e = el(id);
    if (e) e.innerHTML = html;
}

function forEachTyreWidget(callback) {
    document.querySelectorAll(".tyre-widget").forEach(callback);
}

const TYRE_CORNERS = ["RL", "RR", "FL", "FR"];

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
    forEachTyreWidget(w => {
        for (let i = 0; i < 4; i++) {
            const corner = TYRE_CORNERS[i];
            const card = w.querySelector(`.tc[data-tyre-corner="${corner}"]`);
            if (!card) continue;

            const ts = surf?.[i];
            const ti = inner?.[i];

            const surfCol = tyreTempColor(ts, range);
            const innerCol = tyreTempColor(ti, range);

            card.style.borderColor = surfCol || "var(--border)";
            card.style.boxShadow = surfCol ? `0 0 8px ${tyreTempColorAlpha(ts, range, 0.3)}` : "";

            const fill = card.querySelector(".tc-fill");
            if (fill) {
                fill.style.background = innerCol ? tyreTempColorAlpha(ti, range, 0.12) : "";
            }

            const nodeS = card.querySelector(".tc-ts");
            const nodeI = card.querySelector(".tc-ti");
            if (nodeS) { nodeS.textContent = formatDeg(ts); nodeS.style.color = surfCol || ""; }
            if (nodeI) { nodeI.textContent = formatDeg(ti); nodeI.style.color = innerCol || ""; }

            const icos = card.querySelectorAll(".tc-temps .tc-ico");
            if (icos[0]) icos[0].style.color = surfCol || "var(--text-dim)";
            if (icos[1]) icos[1].style.color = innerCol || "var(--text-dim)";

            const psiEl = card.querySelector(".tc-psi");
            if (psiEl) psiEl.textContent = press?.[i] != null ? press[i].toFixed(1) + " psi" : "-- psi";
        }
    });
}

function setTyreWidgetWear(car) {
    const wear = car?.tyresWear;
    const blisters = car?.tyreBlisters;

    forEachTyreWidget(w => {
        for (let i = 0; i < 4; i++) {
            const corner = TYRE_CORNERS[i];
            const card = w.querySelector(`.tc[data-tyre-corner="${corner}"]`);
            if (!card) continue;

            const wearNode = card.querySelector(".tc-wear");
            const fill = card.querySelector(".tc-fill");
            const blsNode = card.querySelector(".tc-bls");

            const w_ = wear?.[i];
            const pct = (w_ != null && Number.isFinite(Number(w_))) ? Math.min(100, Math.max(0, Number(w_))) : null;

            if (wearNode) wearNode.textContent = pct !== null ? Math.round(pct) + "%" : "--";
            if (fill) fill.style.height = pct !== null ? (100 - pct) + "%" : "100%";
            if (blsNode) blsNode.textContent = blisters?.[i] != null ? `Blisters ${blisters[i]}%` : "Blisters --";
        }
    });
}

function setTyreWidgetCompoundAge(car) {
    if (!car) return;
    const visual = VISUAL_COMPOUNDS[car.visualTyreCompound] || "--";
    const actual = ACTUAL_COMPOUNDS[car.actualTyreCompound] || "";
    const dotCol = COMPOUND_DOT_COLORS[car.visualTyreCompound] || "var(--text-dim)";
    const range = getCompoundTempRange(car.actualTyreCompound);

    const nameText = actual ? `${actual}` : visual;
    const rangeText = `${range.min}–${range.max}°C`;
    const ageText = `${car.tyresAgeLaps} laps`;

    forEachTyreWidget(w => {
        const dot = w.querySelector("[data-ti-dot]");
        const name = w.querySelector("[data-ti-name]");
        const rng = w.querySelector("[data-ti-range]");
        const age = w.querySelector("[data-ti-age]");
        if (dot) dot.style.background = dotCol;
        if (name) name.textContent = nameText;
        if (rng) rng.textContent = rangeText;
        if (age) age.textContent = ageText;
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
    if (!e) return;
    const deltaAbs = Math.abs(trend.delta);
    const deltaText = deltaAbs > 0 ? ` (${trend.delta > 0 ? "+" : ""}${trend.delta}°)` : "";
    e.innerHTML = `${temp}°C <span class="temp-trend ${trend.cls}">${trend.arrow}${deltaText}</span>`;
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

    setText("safetyCarStatus", SAFETY_CAR_STATUS[data.safetyCarStatus] || "None");
    setText("totalLaps", data.totalLaps > 0 ? data.totalLaps : "--");

    const timeLeftSec = data.sessionTimeLeft;
    if (timeLeftSec > 0) {
        const m = Math.floor(timeLeftSec / 60);
        const s = timeLeftSec % 60;
        setText("timeLeft", `${m}:${String(s).padStart(2, "0")}`);
    } else {
        setText("timeLeft", "--");
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
                if (playerLapPeakSpeed > 0) playerLastLapPeakSpeed = playerLapPeakSpeed;
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

    setText("speed", car.speed);
    const gear = car.gear;
    setText("gear", gear === -1 ? "R" : gear === 0 ? "N" : gear.toString());

    const scale = playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK;
    syncRpmBarSegmentWidths(scale);
    const rpmPct = Math.min(100, (car.engineRpm / scale) * 100);
    const rpmClip = el("rpmBarClip");
    if (rpmClip) rpmClip.style.setProperty("--rpm-pct", `${rpmPct}%`);
    setText("rpmValue", `${car.engineRpm} / ${scale} RPM`);

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
        if (playerLapPeakSpeed > 0) playerLastLapPeakSpeed = playerLapPeakSpeed;
        playerLapPeakForLapNum = ln;
        playerLapPeakSpeed = 0;
        updateTopSpeedWidgets();
    }

    setText("position", car.carPosition || "--");
    setText("currentLap", car.currentLapNum || "--");
    setText("currentLapTime", formatTime(car.currentLapTimeInMs));
    setText("lastLapTime", formatTime(car.lastLapTimeInMs));
    setText("sector1", formatSectorTime(car.sector1TimeMsPart, car.sector1TimeMinutesPart));
    setText("sector2", formatSectorTime(car.sector2TimeMsPart, car.sector2TimeMinutesPart));

    updateStandings(data);
    updateQualiStandings();
    updatePitPredictor();
    updateGapBoard();
    updateGapRing();
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
            participantTeamIds[i] = p?.teamId != null ? p.teamId : -1;
        }
    }
    updateTopSpeedWidgets();
    updateGapRing();
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
        if (thisLap > 0 && lastLap > 0) {
            const delta = Math.round(thisLap - lastLap);
            const sign = delta >= 0 ? "+" : "";
            thisLapDeltaEl.textContent = sign + delta + " vs last";
            thisLapDeltaEl.className = "tsc-delta " + (delta >= 0 ? "tsc-delta-up" : "tsc-delta-down");
        } else if (thisLap > 0 && sessionBest > 0) {
            const delta = Math.round(thisLap - sessionBest);
            const sign = delta >= 0 ? "+" : "";
            thisLapDeltaEl.textContent = sign + delta + " vs best";
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
    let timeCtx;
    if (isRaceSession) {
        const lap = lastLapDataPacket?.lapDataItems?.[playerCarIndex]?.currentLapNum ?? 0;
        const totalLaps = lastSessionPacket?.totalLaps ?? 0;
        timeCtx = { mode: "race", lap, totalLaps };
    } else {
        const duration = lastSessionPacket?.sessionDuration ?? 0;
        timeCtx = { mode: "timed", elapsed, duration };
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
    if (ctx.mode === "race") {
        const lap = ctx.lap > 0 ? ctx.lap : "--";
        const total = ctx.totalLaps > 0 ? ctx.totalLaps : "--";
        return `L${lap} / ${total}`;
    }
    const elapsed = ctx.elapsed;
    const duration = ctx.duration;
    if (elapsed < 0 || duration <= 0) return "--";
    return `${fmtMmSs(elapsed)} / ${fmtMmSs(duration)}`;
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
        <span class="event-detail">${e.name}${e.detail ? " — " + e.detail : ""}${servedBadge}</span>
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

function getCompoundAbbr(name) {
    const map = { "Super Soft": "SS", "Soft": "S", "Medium": "M", "Hard": "H", "Dry": "D", "Inter": "I", "Wet": "W" };
    return map[name] || (name[0] || "?");
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
    }));

    // Update fitted banner
    const fittedSet = annotated[fittedIdx];
    const fittedEl = el("fittedCompound");
    if (fittedEl && fittedSet) {
        const info = fittedSet.compoundInfo;
        const abbr = getCompoundAbbr(info.name);
        const wearColor = fittedSet.wear > 60 ? "var(--danger)" : fittedSet.wear > 30 ? "var(--warning)" : "var(--safe)";
        fittedEl.innerHTML = `<span class="tyreset-badge ${info.css}">${abbr}</span>`
            + `<span>${info.name}</span>`
            + `<span style="color:${wearColor}">${fittedSet.wear}% worn</span>`
            + `<span style="color:var(--text-dim)">${fittedSet.lifeSpan}L left</span>`;
    }

    const container = el("tyreSetGroups");
    if (!container) return;

    // Split into available (incl. fitted) and used sets
    const available = annotated.filter(s => s.available || s.isFitted);
    const used = annotated.filter(s => !s.available && !s.isFitted);

    // Sort available: by compound order, then by wear ascending (freshest first)
    available.sort((a, b) => {
        const ai = compoundOrder.indexOf(a.compoundInfo.name);
        const bi = compoundOrder.indexOf(b.compoundInfo.name);
        if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return a.wear - b.wear;
    });

    let html = "";

    // --- Available section ---
    if (available.length > 0) {
        html += `<div class="tyreset-section">`;
        html += `<div class="tyreset-section-header">`
            + `<span class="tyreset-section-title">Available</span>`
            + `<span class="tyreset-section-count">${available.length} set${available.length !== 1 ? "s" : ""}</span>`
            + `</div>`;
        for (const s of available) {
            const wearPct = s.wear;
            const wearColor = wearPct > 60 ? "var(--danger)" : wearPct > 30 ? "var(--warning)" : "var(--safe)";
            const delta = s.lapDeltaTime;
            const deltaSign = delta > 0 ? "+" : "";
            const deltaCls = delta > 0 ? "positive" : delta < 0 ? "negative" : "zero";
            const deltaText = delta !== 0 ? `${deltaSign}${(delta / 1000).toFixed(1)}s` : "—";
            const abbr = getCompoundAbbr(s.compoundInfo.name);
            const cls = s.isFitted ? "tyreset-item fitted" : "tyreset-item";
            html += `<div class="${cls}">`;
            html += `<span class="tyreset-badge ${s.compoundInfo.css}">${abbr}</span>`;
            html += `<div class="tyreset-wear-bar"><div class="tyreset-wear-fill" style="width:${100 - wearPct}%;background:${wearColor}"></div></div>`;
            html += `<span class="tyreset-wear-pct" style="color:${wearColor}">${wearPct}%</span>`;
            html += `<span class="tyreset-life">${s.lifeSpan}L</span>`;
            html += `<span class="tyreset-delta ${deltaCls}">${deltaText}</span>`;
            if (s.isFitted) html += `<span class="tyreset-fitted-badge">ON</span>`;
            html += `</div>`;
        }
        html += `</div>`;
    }

    // --- Used section ---
    if (used.length > 0) {
        // Sort used by compound order
        used.sort((a, b) => {
            const ai = compoundOrder.indexOf(a.compoundInfo.name);
            const bi = compoundOrder.indexOf(b.compoundInfo.name);
            return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });
        html += `<div class="tyreset-section tyreset-section-used">`;
        html += `<div class="tyreset-section-header">`
            + `<span class="tyreset-section-title">Used</span>`
            + `<span class="tyreset-section-count">${used.length} set${used.length !== 1 ? "s" : ""}</span>`
            + `</div>`;
        for (const s of used) {
            const wearPct = s.wear;
            const wearColor = wearPct > 60 ? "var(--danger)" : wearPct > 30 ? "var(--warning)" : "var(--safe)";
            const abbr = getCompoundAbbr(s.compoundInfo.name);
            html += `<div class="tyreset-item">`;
            html += `<span class="tyreset-badge tyreset-badge-sm ${s.compoundInfo.css}">${abbr}</span>`;
            html += `<div class="tyreset-wear-bar"><div class="tyreset-wear-fill" style="width:${100 - wearPct}%;background:${wearColor}"></div></div>`;
            html += `<span class="tyreset-wear-pct">${wearPct}%</span>`;
            html += `<span class="tyreset-life">${s.lifeSpan}L</span>`;
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
    if (entry && entry.pitTimeSec != null && Number.isFinite(Number(entry.pitTimeSec)))
        return Number(entry.pitTimeSec);
    return DEFAULT_PIT_TIME_SEC;
}

function updatePitPredictor() {
    const pitInput = el("pitTimeInput");
    if (!pitInput) return;
    if (!lastLapDataPacket) return;
    const items = lastLapDataPacket.lapDataItems;
    if (!items) return;

    const playerLap = items[playerCarIndex];
    if (!playerLap || playerLap.resultStatus < 2) return;

    const pitTimeSec = parseFloat(pitInput.value) || getPitTimeForTrack(currentTrackId) || DEFAULT_PIT_TIME_SEC;
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

    setText("pitPredPos", predictedPos);

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
        setText("pitAheadName", carAhead.name);
        setText("pitAheadGap", `+${(carAhead.gapMs / 1000).toFixed(1)}s`);
    } else {
        setText("pitAheadName", "Leader");
        setText("pitAheadGap", "--");
    }

    if (carBehind) {
        setText("pitBehindName", carBehind.name);
        setText("pitBehindGap", `-${(carBehind.gapMs / 1000).toFixed(1)}s`);
    } else {
        setText("pitBehindName", "No car behind");
        setText("pitBehindGap", "--");
    }
}

async function savePitTime() {
    const pitInput = el("pitTimeInput");
    if (!pitInput) return;
    const val = parseFloat(pitInput.value);
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
            setText("pitSaveStatus", "Saved!");
            setTimeout(() => { setText("pitSaveStatus", ""); }, 2000);
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

    const leaderLap = items[sorted[0].idx].currentLapNum || 0;
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
        placed.push({ d, cos, sin });
    }

    let paths = "";
    paths += `<circle cx="0" cy="0" r="${R_DOT}" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="6" />`;
    paths += `<line x1="0" y1="-46" x2="0" y2="-80" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-linecap="round" />`;
    paths += `<text x="0" y="-84" class="gap-ring-sf" font-size="8" fill="rgba(255,255,255,0.4)" text-anchor="middle" dominant-baseline="auto">S/F</text>`;

    for (const { cos, sin } of placed) {
        const cx = cos * R_DOT;
        const cy = sin * R_DOT;
        paths += `<line x1="0" y1="0" x2="${cx}" y2="${cy}" class="gap-ring-spoke" stroke="rgba(255,255,255,0.09)" stroke-width="0.5" />`;
    }

    for (const { d, cos, sin } of placed) {
        const teamColor = teamAccentColor(participantTeamIds[d.idx]);
        const cx = cos * R_DOT;
        const cy = sin * R_DOT;
        const rDotPx = d.isPlayer ? 5.5 : 4.5;
        const sw = d.isPlayer ? 1.8 : 1.1;
        paths += `<circle cx="${cx}" cy="${cy}" r="${rDotPx}" fill="${teamColor}" fill-opacity="0.92" stroke="rgba(255,255,255,0.9)" stroke-width="${sw}" />`;
    }

    for (const { d, cos, sin } of placed) {
        const lapsDown = leaderLap - (d.currentLapNum || 0);
        const lapSuffix = lapsDown > 0 ? ` ${lapsDown}L` : "";

        const teamColor = teamAccentColor(participantTeamIds[d.idx]);
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
        paths += `<text x="${ox}" y="${oy}" class="gap-ring-txt-outer" font-size="${fontOuter}">${escapeXmlText(outerText)}</text>`;
        paths += `<text x="${mx}" y="${my}" class="${nameCls}" fill="${teamColor}" font-size="${fontName}" font-weight="600">${escapeXmlText(driverAbbrFromName(d.name) + lapSuffix)}</text>`;
        paths += `<text x="${ix}" y="${iy}" class="gap-ring-txt-inner" font-size="${fontInner}">${escapeXmlText(innerText)}</text>`;
    }

    if (svg) svg.innerHTML = paths;

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

    const aheadTeamColor = ahead ? teamAccentColor(participantTeamIds[ahead.idx]) : null;
    const behindTeamColor = behind ? teamAccentColor(participantTeamIds[behind.idx]) : null;

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
