(function () {
    "use strict";

    var STORAGE_KEY = "f1telemetry_shift_model_v1";
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

    var db = {};
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
            if (!raw) return;
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") db = parsed;
        } catch (e) {
            db = {};
        }
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
        if (teamId == null || teamId < 0) { active = null; return; }
        var key = String(teamId);
        if (active && active.teamId === teamId) return;
        if (!db[key]) db[key] = makeBucket(teamId);
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

    function gearRatio(g) {
        if (!active || g < 1 || g > MAX_GEAR) return 0;
        if (active.gearCount[g] < MIN_RATIO_SAMPLES) return 0;
        return active.gearSpeedSum[g] / active.gearRpmSum[g];
    }

    function powerAt(rpm) {
        if (!active) return 0;
        var b = rpm / BIN_SIZE;
        var b0 = Math.floor(b);
        var b1 = Math.min(BIN_COUNT - 1, b0 + 1);
        if (b0 < 0 || b0 >= BIN_COUNT) return 0;
        var p0 = active.powerCount[b0] > 0 ? active.powerBins[b0] : 0;
        var p1 = active.powerCount[b1] > 0 ? active.powerBins[b1] : 0;
        if (p0 === 0 && p1 === 0) return 0;
        if (p0 === 0) return p1;
        if (p1 === 0) return p0;
        var t = b - b0;
        return p0 + (p1 - p0) * t;
    }

    function powerCoverage(rpmMax) {
        if (!active) return 0;
        var maxBin = Math.min(BIN_COUNT, Math.ceil(rpmMax / BIN_SIZE));
        var minBin = Math.floor(SCAN_MIN_RPM / BIN_SIZE);
        if (maxBin <= minBin) return 0;
        var peak = 0;
        for (var i = 0; i < BIN_COUNT; i++) {
            if (active.powerBins[i] > peak) peak = active.powerBins[i];
        }
        if (peak <= 0) return 0;
        var threshold = peak * POWER_COVERAGE_BIN_FRACTION;
        var filled = 0;
        for (var j = minBin; j < maxBin; j++) {
            if (active.powerBins[j] >= threshold) filled++;
        }
        return filled / (maxBin - minBin);
    }

    function peakPowerRpm(rpmMax) {
        if (!active) return 0;
        var maxBin = Math.min(BIN_COUNT, Math.ceil(rpmMax / BIN_SIZE));
        var bestRpm = 0;
        var bestP = 0;
        for (var i = 0; i < maxBin; i++) {
            if (active.powerCount[i] > 0 && active.powerBins[i] > bestP) {
                bestP = active.powerBins[i];
                bestRpm = (i + 0.5) * BIN_SIZE;
            }
        }
        return bestRpm;
    }

    function computeShiftRpm(gear, rpmMax) {
        if (!active) return null;
        if (gear < 1 || gear >= MAX_GEAR) return null;
        var rg = gearRatio(gear);
        var rn = gearRatio(gear + 1);
        if (rg <= 0 || rn <= 0) return null;
        if (powerCoverage(rpmMax) < POWER_COVERAGE_MIN) return null;

        var ratio = rg / rn;
        var shift = 0;
        for (var R = SCAN_MIN_RPM; R <= rpmMax; R += SCAN_STEP_RPM) {
            var Rpost = R * ratio;
            if (Rpost < SCAN_MIN_RPM || Rpost > rpmMax) continue;
            var Ppre = powerAt(R);
            var Ppost = powerAt(Rpost);
            if (Ppre <= 0 || Ppost <= 0) continue;
            if (Ppre <= Ppost) { shift = R; break; }
        }
        if (shift === 0) shift = peakPowerRpm(rpmMax);
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
        lastShiftRpm = computeShiftRpm(gear, rpmMax);
        return lastShiftRpm;
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

    window.addEventListener("beforeunload", flush);

    load();

    window.ShiftModel = {
        setTeam: setTeam,
        sample: sample,
        updatePower: updatePower,
        getShiftRpm: getShiftRpm,
        reset: reset,
        resetAll: resetAll,
        _internals: function () { return { db: db, active: active, totalWrites: totalWrites }; },
    };
})();
