"use strict";

// Track IDs: EA "Data Output from F1 25" v3 PDF appendix (m_trackId, int8, -1 = unknown)
const TRACK_NAMES = {
    0: "Melbourne",
    2: "Shanghai",
    3: "Sakhir (Bahrain)",
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
    20: "Baku (Azerbaijan)",
    26: "Zandvoort",
    27: "Imola",
    29: "Jeddah",
    30: "Miami",
    31: "Las Vegas",
    32: "Losail",
    39: "Silverstone (Reverse)",
    40: "Austria (Reverse)",
    41: "Zandvoort (Reverse)"
};

// Session types: F1 25 v3 PDF appendix (m_sessionType)
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

const TYRE_COMPOUNDS = {
    16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
    7: "Inter", 8: "Wet"
};

const VISUAL_COMPOUNDS = {
    16: "Soft", 17: "Medium", 18: "Hard", 7: "Inter", 8: "Wet"
};

const ERS_MODES = { 0: "None", 1: "Medium", 2: "Hotlap", 3: "Overtake" };

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
    "OVTK": "Overtake", "SCAR": "Safety Car", "COLL": "Collision"
};

const PENALTY_CODES = new Set(["PENA", "DTSV", "SGSV"]);

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
    5: "Collision failed to hand back position single",
    6: "Collision failed to hand back position multiple",
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

let playerCarIndex = 0;
let participantNames = [];
let maxEvents = 50;
let events = [];
let pinnedPenalties = [];
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

/** Throttle / brake traces for Car Telemetry pedal chart (0..1 samples, oldest → newest). */
const PEDAL_HISTORY_LEN = 180;
const pedalHistoryT = [];
const pedalHistoryB = [];

/** m_maxRPM from Car Status (rev limiter); 0 until first Car Status for this session. */
let playerMaxRpm = 0;
const RPM_SCALE_FALLBACK = 15000;
/** Absolute RPM thresholds for bar colours (vs current max RPM scale). */
const RPM_BAR_RED_START = 11000;
const RPM_BAR_BLUE_START = 11600;
let lastSessionLinkId = null;

function el(id) { return document.getElementById(id); }

/** Grey track; clipped fill is green 0..RED_START, red RED_START..BLUE_START, blue to max. */
function syncRpmBarSegmentWidths(scale) {
    const s = scale > 0 ? scale : RPM_SCALE_FALLBACK;
    const a = Math.min(RPM_BAR_RED_START, s);
    const b = Math.min(RPM_BAR_BLUE_START, s);
    const wGreen = a;
    const wRed = Math.max(0, b - a);
    const wBlue = Math.max(0, s - b);
    const setFlex = (id, w) => {
        const node = el(id);
        if (node) node.style.flex = `${w} 0 0`;
    };
    setFlex("rpmSegGreen", wGreen);
    setFlex("rpmSegRed", wRed);
    setFlex("rpmSegBlue", wBlue);
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

function updateSession(data) {
    lastSessionPacket = data;

    const linkId = data.sessionLinkIdentifier;
    if (linkId !== undefined && linkId !== null) {
        if (lastSessionLinkId !== null && linkId !== lastSessionLinkId) {
            playerMaxRpm = 0;
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

    // Tyre surface temperatures: order is RL, RR, FL, FR
    const tempFL = car.tyresSurfaceTemperature[2];
    const tempFR = car.tyresSurfaceTemperature[3];
    const tempRL = car.tyresSurfaceTemperature[0];
    const tempRR = car.tyresSurfaceTemperature[1];

    const setTyreTemp = (elId, temp) => {
        const e = el(elId);
        e.textContent = temp + "°";
        e.className = "tyre-temp " + getTyreTemperatureClass(temp);
    };

    setTyreTemp("tyreTempFL", tempFL);
    setTyreTemp("tyreTempFR", tempFR);
    setTyreTemp("tyreTempRL", tempRL);
    setTyreTemp("tyreTempRR", tempRR);
}

function updateCarStatus(data) {
    const car = data.carStatusDataItems?.[playerCarIndex];
    if (!car) return;

    if (car.maxRpm > 0) {
        playerMaxRpm = car.maxRpm;
    }

    syncRpmBarSegmentWidths(playerMaxRpm > 0 ? playerMaxRpm : RPM_SCALE_FALLBACK);

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

    el("fuelRemaining").textContent = car.fuelInTank.toFixed(1) + " kg";
    el("fuelLaps").textContent = car.fuelRemainingLaps.toFixed(1) + " laps";
    el("ersMode").textContent = ERS_MODES[car.ersDeployMode] || "--";

    const maxErs = 4000000;
    const ersPct = Math.min(100, (car.ersStoreEnergy / maxErs) * 100);
    el("ersBar").style.width = ersPct + "%";

    el("tyreCompound").textContent = VISUAL_COMPOUNDS[car.visualTyreCompound] || `ID:${car.visualTyreCompound}`;
    el("tyreAge").textContent = car.tyresAgeLaps + " laps";
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

    // Tyre wear: order RL, RR, FL, FR
    el("tyreWearFL").textContent = car.tyresWear[2].toFixed(0) + "%";
    el("tyreWearFR").textContent = car.tyresWear[3].toFixed(0) + "%";
    el("tyreWearRL").textContent = car.tyresWear[0].toFixed(0) + "%";
    el("tyreWearRR").textContent = car.tyresWear[1].toFixed(0) + "%";
}

function updateParticipants(data) {
    participantNames = [];
    if (data.participants) {
        for (let i = 0; i < data.participants.length; i++) {
            participantNames[i] = data.participants[i]?.name || `Car ${i}`;
        }
    }
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
    if (code === "BUTN") return;

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

    if (code === "PENA") {
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
    const cls = pinned ? "event-item penalty pinned" :
                e.isPenalty ? "event-item penalty" : "event-item";
    const codeClass = e.isPenalty ? "event-code penalty-code" : "event-code";
    const icon = pinned ? '<span class="pin-icon">&#128204;</span> ' : "";
    const servedBadge = e.served ? ' <span class="served-badge">SERVED</span>' : "";
    return `<div class="${cls}">
        <span class="${codeClass}">${icon}${e.code}</span>
        <span class="event-detail">${e.name}${e.detail ? " — " + e.detail : ""}${servedBadge}</span>
        <span class="event-time">${e.time}s</span>
    </div>`;
}

function renderEvents() {
    const list = el("eventsList");
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

    html += events.map(e => renderEventItem(e, false)).join("");

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
        7:  { name: "Inter", css: "compound-inter", dot: "#00cc00" },
        8:  { name: "Wet", css: "compound-wet", dot: "#00a6ff" },
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
    const order = ["Soft", "Medium", "Hard", "Inter", "Wet"];
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

        const uid = header?.sessionUid;
        if (uid != null) {
            if (lastTelemetrySessionUid != null && uid !== lastTelemetrySessionUid) {
                pinnedPenalties = [];
                renderEvents();
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
                if (handler) handler(data);
            }
        })
        .catch(err => console.warn("Failed to get current state:", err));
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof initWidgets === "function") initWidgets();
    syncRpmBarSegmentWidths(RPM_SCALE_FALLBACK);
    await loadPitTimes();
    initConnection();
});
