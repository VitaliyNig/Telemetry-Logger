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

let playerCarIndex = 0;
let participantNames = [];
let maxEvents = 50;
let events = [];

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

function updateSession(data) {
    el("trackName").textContent = TRACK_NAMES[data.trackId] || `Track ${data.trackId}`;
    el("sessionType").textContent = SESSION_TYPES[data.sessionType] || `Type ${data.sessionType}`;
    el("weather").textContent = WEATHER_NAMES[data.weather] || "Unknown";
    el("trackTemp").textContent = data.trackTemperature + "°C";
    el("airTemp").textContent = data.airTemperature + "°C";
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
    const car = data.lapDataItems?.[playerCarIndex];
    if (!car) return;

    el("position").textContent = car.carPosition || "--";
    el("currentLap").textContent = car.currentLapNum || "--";
    el("currentLapTime").textContent = formatTime(car.currentLapTimeInMs);
    el("lastLapTime").textContent = formatTime(car.lastLapTimeInMs);
    el("sector1").textContent = formatSectorTime(car.sector1TimeMsPart, car.sector1TimeMinutesPart);
    el("sector2").textContent = formatSectorTime(car.sector2TimeMsPart, car.sector2TimeMinutesPart);

    updateStandings(data);
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

function updateEvent(data, header) {
    const code = data.eventCode;
    const name = EVENT_NAMES[code] || code;
    let detail = "";

    if (data.details) {
        const d = data.details;
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

    const time = header?.sessionTime?.toFixed(1) || "--";
    events.unshift({ code, name, detail, time });
    if (events.length > maxEvents) events.length = maxEvents;
    renderEvents();
}

function renderEvents() {
    const list = el("eventsList");
    if (events.length === 0) {
        list.innerHTML = '<div class="event-item placeholder">Waiting for events...</div>';
        return;
    }
    list.innerHTML = events.map(e => `
        <div class="event-item">
            <span class="event-code">${e.code}</span>
            <span class="event-detail">${e.name}${e.detail ? " — " + e.detail : ""}</span>
            <span class="event-time">${e.time}s</span>
        </div>
    `).join("");
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

const PACKET_HANDLERS = {
    Session: updateSession,
    CarTelemetry: updateCarTelemetry,
    CarStatus: updateCarStatus,
    LapData: updateLapData,
    CarDamage: updateCarDamage,
    Participants: updateParticipants,
    Event: updateEvent,
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

document.addEventListener("DOMContentLoaded", initConnection);
