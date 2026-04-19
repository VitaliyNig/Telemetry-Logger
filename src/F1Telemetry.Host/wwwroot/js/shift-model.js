(function () {
    "use strict";

    var STORAGE_KEY = "f1telemetry_shift_model_v1";
    var CALIBRATION_KEY = "f1telemetry_shift_calibration_v1";
    var BIN_SIZE = 250;
    var BIN_COUNT = 60;
    var MAX_GEAR = 8;
    var MIN_RATIO_SAMPLES = 20;
    var THROTTLE_MIN = 0.5;
    var RATIO_MIN_RPM = 4000;
    var RATIO_MIN_SPEED = 20;
    var SAMPLE_CAP = 10000;
    var SCAN_STEP_RPM = 100;
    var SHIFT_ROUND_RPM = 50;
    var SCAN_MIN_RPM = 4000;
    var POWER_COVERAGE_MIN = 0.3;
    var POWER_COVERAGE_BIN_FRACTION = 0.5;
    var POST_SHIFT_LOCKOUT_MS = 200;
    var RENDER_MIN_INTERVAL_MS = 200;
    var SAVE_DEBOUNCE_MS = 2000;

    var F2_MONO_ID = -2;
    var F2_TEAM_IDS = {
        155: true, 158: true, 159: true, 160: true, 161: true, 162: true,
        163: true, 164: true, 165: true, 166: true, 167: true, 168: true,
    };

    function normalizeTeamId(teamId) {
        if (teamId == null) return null;
        var n = Number(teamId);
        if (!Number.isFinite(n)) return null;
        if (F2_TEAM_IDS[n]) return F2_MONO_ID;
        return n;
    }

    var db = {};
    var calibrationEnabled = true;
    var active = null;
    var lastIcePower = 0;
    var lastGear = 0;
    var lastGearChangeMs = 0;
    var totalWrites = 0;
    var saveTimer = null;
    var dirty = false;

    var lastRenderAt = 0;
    var lastRenderedGear = null;
    var lastShiftRpm = null;

    function makeBucket(teamId) {
        return {
            teamId: teamId,
            powerBins: new Array(BIN_COUNT).fill(0),
            powerCount: new Array(BIN_COUNT).fill(0),
            gearSpeedSum: new Array(MAX_GEAR + 1).fill(0),
            gearRpmSum: new Array(MAX_GEAR + 1).fill(0),
            gearCount: new Array(MAX_GEAR + 1).fill(0),
            maxRpm: 0,
            updatedAt: 0,
        };
    }

    function load() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                var parsed = JSON.parse(raw);
                if (parsed && typeof parsed === "object") db = parsed;
            }
        } catch (e) {
            db = {};
        }
        try {
            var rawCal = localStorage.getItem(CALIBRATION_KEY);
            if (rawCal != null) calibrationEnabled = rawCal !== "false";
        } catch (e) { /* keep default */ }
    }

    function hasAnySamples(bucket) {
        if (!bucket) return false;
        for (var g = 1; g <= MAX_GEAR; g++) {
            if (bucket.gearCount[g] > 0) return true;
        }
        for (var i = 0; i < BIN_COUNT; i++) {
            if (bucket.powerCount[i] > 0) return true;
        }
        return false;
    }

    function shouldRecord() {
        if (calibrationEnabled) return true;
        return !hasAnySamples(active);
    }

    function scheduleSave() {
        dirty = true;
        if (saveTimer) return;
        saveTimer = setTimeout(function () {
            saveTimer = null;
            flush();
        }, SAVE_DEBOUNCE_MS);
    }

    function flush() {
        if (!dirty) return;
        dirty = false;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
        } catch (e) {}
    }

    function setTeam(teamId) {
        var id = normalizeTeamId(teamId);
        if (id == null || (id < 0 && id !== F2_MONO_ID)) { active = null; return; }
        var key = String(id);
        if (active && active.teamId === id) return;
        if (!db[key]) db[key] = makeBucket(id);
        active = db[key];
        lastRenderedGear = null;
        lastShiftRpm = null;
    }

    function updatePower(iceW, _mguKW) {
        lastIcePower = Number(iceW) || 0;
    }

    function sample(car, rpmMax) {
        if (!active || !car) return;
        var gear = car.gear | 0;
        var rpm = Number(car.engineRpm) || 0;
        var throttle = Number(car.throttle) || 0;
        var speed = Number(car.speed) || 0;
        var now = performance.now();

        if (gear !== lastGear) {
            lastGearChangeMs = now;
            lastGear = gear;
        }

        if (rpmMax > 0 && rpmMax > active.maxRpm) active.maxRpm = rpmMax;

        if (!shouldRecord()) return;
        if (totalWrites >= SAMPLE_CAP) return;
        if (gear < 1 || rpm <= 0 || throttle < THROTTLE_MIN) return;
        var postShiftSettled = (now - lastGearChangeMs) >= POST_SHIFT_LOCKOUT_MS;

        var P = lastIcePower;
        if (P > 0 && postShiftSettled) {
            var b = Math.floor(rpm / BIN_SIZE);
            if (b >= 0 && b < BIN_COUNT) {
                if (P > active.powerBins[b]) active.powerBins[b] = P;
                active.powerCount[b]++;
                totalWrites++;
                dirty = true;
            }
        }

        if (gear <= MAX_GEAR && rpm > RATIO_MIN_RPM && speed > RATIO_MIN_SPEED &&
            postShiftSettled) {
            active.gearSpeedSum[gear] += speed;
            active.gearRpmSum[gear] += rpm;
            active.gearCount[gear]++;
            totalWrites++;
            dirty = true;
        }

        active.updatedAt = Date.now();
        if (dirty) scheduleSave();
    }

    function gearRatio(bucket, g) {
        var b = bucket || active;
        if (!b || g < 1 || g > MAX_GEAR) return 0;
        if (b.gearCount[g] < MIN_RATIO_SAMPLES) return 0;
        return b.gearSpeedSum[g] / b.gearRpmSum[g];
    }

    function powerAt(bucket, rpm) {
        var bk = bucket || active;
        if (!bk) return 0;
        var b = rpm / BIN_SIZE;
        var b0 = Math.floor(b);
        var b1 = Math.min(BIN_COUNT - 1, b0 + 1);
        if (b0 < 0 || b0 >= BIN_COUNT) return 0;
        var p0 = bk.powerCount[b0] > 0 ? bk.powerBins[b0] : 0;
        var p1 = bk.powerCount[b1] > 0 ? bk.powerBins[b1] : 0;
        if (p0 === 0 && p1 === 0) return 0;
        if (p0 === 0) return p1;
        if (p1 === 0) return p0;
        var t = b - b0;
        return p0 + (p1 - p0) * t;
    }

    function powerCoverage(bucket, rpmMax) {
        var bk = bucket || active;
        if (!bk) return 0;
        var maxBin = Math.min(BIN_COUNT, Math.ceil(rpmMax / BIN_SIZE));
        var minBin = Math.floor(SCAN_MIN_RPM / BIN_SIZE);
        if (maxBin <= minBin) return 0;
        var peak = 0;
        for (var i = 0; i < BIN_COUNT; i++) {
            if (bk.powerBins[i] > peak) peak = bk.powerBins[i];
        }
        if (peak <= 0) return 0;
        var threshold = peak * POWER_COVERAGE_BIN_FRACTION;
        var filled = 0;
        for (var j = minBin; j < maxBin; j++) {
            if (bk.powerBins[j] >= threshold) filled++;
        }
        return filled / (maxBin - minBin);
    }

    function peakPowerRpm(bucket, rpmMax) {
        var bk = bucket || active;
        if (!bk) return 0;
        var maxBin = Math.min(BIN_COUNT, Math.ceil(rpmMax / BIN_SIZE));
        var bestRpm = 0;
        var bestP = 0;
        for (var i = 0; i < maxBin; i++) {
            if (bk.powerCount[i] > 0 && bk.powerBins[i] > bestP) {
                bestP = bk.powerBins[i];
                bestRpm = (i + 0.5) * BIN_SIZE;
            }
        }
        return bestRpm;
    }

    function computeShiftRpm(bucket, gear, rpmMax) {
        var bk = bucket || active;
        if (!bk) return null;
        if (gear < 1 || gear >= MAX_GEAR) return null;
        var rg = gearRatio(bk, gear);
        var rn = gearRatio(bk, gear + 1);
        if (rg <= 0 || rn <= 0) return null;
        if (powerCoverage(bk, rpmMax) < POWER_COVERAGE_MIN) return null;

        var ratio = rg / rn;
        var shift = 0;
        for (var R = SCAN_MIN_RPM; R <= rpmMax; R += SCAN_STEP_RPM) {
            var Rpost = R * ratio;
            if (Rpost < SCAN_MIN_RPM || Rpost > rpmMax) continue;
            var Ppre = powerAt(bk, R);
            var Ppost = powerAt(bk, Rpost);
            if (Ppre <= 0 || Ppost <= 0) continue;
            if (Ppre <= Ppost) { shift = R; break; }
        }
        if (shift === 0) shift = peakPowerRpm(bk, rpmMax);
        if (shift <= 0) return null;
        return Math.round(shift / SHIFT_ROUND_RPM) * SHIFT_ROUND_RPM;
    }

    function getShiftRpm(gear, rpmMax) {
        var now = performance.now();
        if (gear === lastRenderedGear && (now - lastRenderAt) < RENDER_MIN_INTERVAL_MS) {
            return lastShiftRpm;
        }
        lastRenderAt = now;
        lastRenderedGear = gear;
        lastShiftRpm = computeShiftRpm(active, gear, rpmMax);
        return lastShiftRpm;
    }

    function getTeamShiftRpms(teamId) {
        var id = normalizeTeamId(teamId);
        if (id == null) return null;
        var bucket = db[String(id)];
        if (!bucket) return null;
        var rpmMax = bucket.maxRpm > 0 ? bucket.maxRpm : 15000;
        var out = [];
        for (var g = 1; g < MAX_GEAR; g++) {
            var rpm = computeShiftRpm(bucket, g, rpmMax);
            out.push({ gear: g, shiftRpm: rpm, samples: bucket.gearCount[g] || 0 });
        }
        return { teamId: bucket.teamId, rpmMax: rpmMax, gears: out };
    }

    function reset() {
        if (!active) return;
        var teamId = active.teamId;
        db[String(teamId)] = makeBucket(teamId);
        active = db[String(teamId)];
        lastRenderedGear = null;
        lastShiftRpm = null;
        totalWrites = 0;
        dirty = true;
        flush();
    }

    function resetAll() {
        db = {};
        active = null;
        dirty = true;
        flush();
    }

    function deleteTeam(teamId) {
        var id = normalizeTeamId(teamId);
        if (id == null) return false;
        var key = String(id);
        if (!db[key]) return false;
        delete db[key];
        if (active && active.teamId === id) {
            active = null;
            lastRenderedGear = null;
            lastShiftRpm = null;
        }
        dirty = true;
        flush();
        return true;
    }

    function listTeams() {
        var out = [];
        for (var key in db) {
            if (!Object.prototype.hasOwnProperty.call(db, key)) continue;
            var b = db[key];
            if (!b) continue;
            var teamId = b.teamId != null ? b.teamId : Number(key);
            var totalGearSamples = 0;
            var totalPowerSamples = 0;
            for (var g = 1; g <= MAX_GEAR; g++) totalGearSamples += b.gearCount[g] || 0;
            for (var i = 0; i < BIN_COUNT; i++) totalPowerSamples += b.powerCount[i] || 0;
            out.push({
                teamId: teamId,
                maxRpm: b.maxRpm || 0,
                updatedAt: b.updatedAt || 0,
                gearSamples: totalGearSamples,
                powerSamples: totalPowerSamples,
                isActive: !!(active && active.teamId === teamId),
            });
        }
        out.sort(function (a, b) {
            if (b.isActive !== a.isActive) return b.isActive - a.isActive;
            return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
        return out;
    }

    function getTeamStats(teamId) {
        var id = normalizeTeamId(teamId);
        if (id == null) return null;
        var b = db[String(id)];
        if (!b) return null;
        var gears = [];
        for (var g = 1; g <= MAX_GEAR; g++) {
            var n = b.gearCount[g] || 0;
            if (n <= 0) {
                gears.push({ gear: g, samples: 0, avgSpeed: 0, avgRpm: 0, ratio: 0 });
                continue;
            }
            var avgSpeed = b.gearSpeedSum[g] / n;
            var avgRpm = b.gearRpmSum[g] / n;
            var ratio = avgRpm > 0 ? avgSpeed / avgRpm : 0;
            gears.push({ gear: g, samples: n, avgSpeed: avgSpeed, avgRpm: avgRpm, ratio: ratio });
        }
        var totalPowerSamples = 0;
        for (var i = 0; i < BIN_COUNT; i++) totalPowerSamples += b.powerCount[i] || 0;
        return {
            teamId: b.teamId != null ? b.teamId : id,
            maxRpm: b.maxRpm || 0,
            updatedAt: b.updatedAt || 0,
            powerSamples: totalPowerSamples,
            gears: gears,
        };
    }

    function getCalibrationEnabled() { return calibrationEnabled; }

    function setCalibrationEnabled(enabled) {
        calibrationEnabled = !!enabled;
        try {
            localStorage.setItem(CALIBRATION_KEY, calibrationEnabled ? "true" : "false");
        } catch (e) { /* ignore */ }
    }

    function isRecording() {
        return shouldRecord() && !!active;
    }

    function getActiveTeamId() {
        return active ? active.teamId : null;
    }

    window.addEventListener("beforeunload", flush);

    load();

    window.ShiftModel = {
        setTeam: setTeam,
        sample: sample,
        updatePower: updatePower,
        getShiftRpm: getShiftRpm,
        reset: reset,
        resetAll: resetAll,
        deleteTeam: deleteTeam,
        listTeams: listTeams,
        getTeamStats: getTeamStats,
        getTeamShiftRpms: getTeamShiftRpms,
        getCalibrationEnabled: getCalibrationEnabled,
        setCalibrationEnabled: setCalibrationEnabled,
        isRecording: isRecording,
        getActiveTeamId: getActiveTeamId,
        _internals: function () { return { db: db, active: active, totalWrites: totalWrites }; },
    };
})();
