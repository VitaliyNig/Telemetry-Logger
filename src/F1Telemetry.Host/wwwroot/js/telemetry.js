"use strict";

const TRACK_NAMES = {
    0: "Melbourne", 1: "Paul Ricard", 2: "Shanghai", 3: "Sakhir",
    4: "Catalunya", 5: "Monaco", 6: "Montreal", 7: "Silverstone",
    8: "Hockenheim", 9: "Hungaroring", 10: "Spa", 11: "Monza",
    12: "Singapore", 13: "Suzuka", 14: "Abu Dhabi", 15: "Austin",
    16: "Interlagos", 17: "Red Bull Ring", 18: "Sochi", 19: "Mexico City",
    20: "Baku", 21: "Sakhir Short", 22: "Silverstone Short", 23: "Austin Short",
    24: "Suzuka Short", 25: "Hanoi", 26: "Zandvoort", 27: "Imola",
    28: "Portimao", 29: "Jeddah", 30: "Miami", 31: "Las Vegas",
    32: "Losail", 33: "Lusail", 34: "Shanghai Short", 35: "Madrid"
};

const SESSION_TYPES = {
    0: "Unknown", 1: "P1", 2: "P2", 3: "P3", 4: "Short P",
    5: "Q1", 6: "Q2", 7: "Q3", 8: "Short Q", 9: "OSQ",
    10: "R", 11: "R2", 12: "R3", 13: "TT", 14: "Sprint Shootout 1",
    15: "Sprint Shootout 2", 16: "Sprint Shootout 3", 17: "Short Sprint Shootout",
    18: "OSS", 19: "Sprint"
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
    "FLBK": "Flashback", "BUTN": "Button Press", "RDFL": "Red Flag",
    "OVTK": "Overtake", "SCAR": "Safety Car", "COLL": "Collision"
};

const PENALTY_CODES = new Set(["PENA", "DTSV", "SGSV"]);

const PENALTY_TYPES = {
    0: "Drive Through", 1: "Stop-Go", 2: "Grid Penalty", 3: "Penalty Reminder",
    4: "Time Penalty", 5: "Warning", 6: "Disqualified", 7: "Removed Formation Lap",
    8: "Parked Too Long", 9: "Tyre Regulations", 10: "This Lap Invalidated",
    11: "This And Next Invalidated", 12: "This And Previous Invalidated",
    13: "Fast Pit", 14: "Pit Lane Speeding", 15: "Retired (Mechanical)",
};

const INFRINGEMENT_TYPES = {
    0: "Blocking", 1: "Colliding", 2: "Colliding (Opponent)",
    3: "Assist Turn Off", 4: "Too Many Flashbacks", 5: "Too Many Flashbacks (Eliminated)",
    6: "Collision (Below Speed)", 7: "Collision (Below Speed (Opponent))",
    8: "Collision (Mini-race)", 9: "Collision (Mini-race (Opponent))",
    10: "AI Too Slow", 11: "Too Slow", 12: "Lap Invalidated (Wrong Way)",
    13: "Lap Invalidated (Cut Corner)", 14: "Received Drive Through (Cut Corner)",
    15: "Received Stop-Go (Cut Corner)", 16: "Went Too Slow",
    17: "Tyre Regulations", 18: "Too Many Penalties",
    19: "Multiple Warnings", 20: "Approaching Disqualification",
    21: "Tyre Regulations (Select Single)", 22: "Tyre Regulations (Select Multiple)",
    23: "Lap Invalidated (Corner Cutting)", 24: "Lap Invalidated (Running Wide)",
    25: "Corner Cutting (Gained Time, No Lap Invalid)",
    26: "Corner Cutting (Gained Time, Removed Overtake)",
    27: "Corner Cutting (Slow Down, No Lap Invalid)",
    28: "Corner Cutting (Slow Down, Removed Overtake)", 29: "Formation Lap (Below Allowed Speed)",
    30: "Formation Lap (Parking)", 31: "Retired (Mechanical Failure)",
    32: "Retired (Terminal Damage)", 33: "Safety Car (Falling Too Far)",
    34: "Black Flag (Timer)", 35: "Unserved Stop-Go (Penalty)",
    36: "Unserved Drive-Through (Penalty)", 37: "Engine Component Change",
    38: "Gearbox Change", 39: "Parc Fermé Change",
    40: "League Grid Penalty", 41: "Retry Penalty", 42: "Illegal Time Gain",
    43: "Mandatory Pitstop", 44: "Attribute Assigned",
};

let playerCarIndex = 0;
let participantNames = [];
let maxEvents = 50;
let events = [];
let pinnedPenalties = [];
let prevTrackTemp = null;
let prevAirTemp = null;
let trackTempHistory = [];
let airTempHistory = [];
const TEMP_HISTORY_MAX = 30;
let currentTrackId = -1;
let pitTimesData = {};
let lastLapDataPacket = null;
let lastSessionPacket = null;

function el(id) { return document.getElementById(id); }

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
    el("trackName").textContent = TRACK_NAMES[data.trackId] || `Track ${data.trackId}`;
    el("sessionType").textContent = SESSION_TYPES[data.sessionType] || `Type ${data.sessionType}`;
    el("weather").textContent = WEATHER_NAMES[data.weather] || "Unknown";

    if (data.trackId !== currentTrackId) {
        currentTrackId = data.trackId;
        const pitTime = getPitTimeForTrack(currentTrackId);
        el("pitTimeInput").value = pitTime.toFixed(1);
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

function updateCarTelemetry(data) {
    const car = data.carTelemetryData?.[playerCarIndex];
    if (!car) return;

    el("speed").textContent = car.speed;
    const gear = car.gear;
    el("gear").textContent = gear === -1 ? "R" : gear === 0 ? "N" : gear.toString();

    const maxRpm = 15000;
    const rpmPct = Math.min(100, (car.engineRpm / maxRpm) * 100);
    el("rpmBar").style.width = rpmPct + "%";
    el("rpmValue").textContent = car.engineRpm + " RPM";

    const throttlePct = Math.round(car.throttle * 100);
    el("throttleBar").style.width = throttlePct + "%";
    el("throttlePct").textContent = throttlePct + "%";

    const brakePct = Math.round(car.brake * 100);
    el("brakeBar").style.width = brakePct + "%";
    el("brakePct").textContent = brakePct + "%";

    const drsEl = el("drsIndicator");
    if (car.drs === 1) {
        drsEl.textContent = "ON";
        drsEl.classList.add("active");
    } else {
        drsEl.textContent = "OFF";
        drsEl.classList.remove("active");
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

    el("fuelRemaining").textContent = car.fuelInTank.toFixed(1) + " kg";
    el("fuelLaps").textContent = car.fuelRemainingLaps.toFixed(1) + " laps";
    el("ersMode").textContent = ERS_MODES[car.ersDeployMode] || "--";

    const maxErs = 4000000;
    const ersPct = Math.min(100, (car.ersStoreEnergy / maxErs) * 100);
    el("ersBar").style.width = ersPct + "%";

    el("tyreCompound").textContent = VISUAL_COMPOUNDS[car.visualTyreCompound] || `ID:${car.visualTyreCompound}`;
    el("tyreAge").textContent = car.tyresAgeLaps + " laps";
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
    updatePitPredictor();
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
            const tag = isFitted ? ' <span style="color:var(--accent-red);font-weight:700;">FIT</span>' : "";
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

const PACKET_HANDLERS = {
    Session: updateSession,
    CarTelemetry: updateCarTelemetry,
    CarStatus: updateCarStatus,
    LapData: updateLapData,
    CarDamage: updateCarDamage,
    Participants: updateParticipants,
    Event: updateEvent,
    TyreSets: updateTyreSets,
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
    await loadPitTimes();
    initConnection();
});
