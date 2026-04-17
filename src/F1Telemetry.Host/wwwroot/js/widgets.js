"use strict";

const WIDGET_REGISTRY = {
    session:      { title: "Session",              tpl: "tpl-session",      w: 4,   h: 9,   minW: 1,    minH: 1 },
    telemetry:    { title: "Car Telemetry",        tpl: "tpl-telemetry",    w: 6,   h: 9,   minW: 1,    minH: 1 },
    tyres:        { title: "Tyres",                tpl: "tpl-tyres",        w: 5,   h: 12,  minW: 1,    minH: 1 },
    tyreSets:     { title: "Available Tyre Sets",  tpl: "tpl-tyreSets",     w: 12,  h: 6,   minW: 1,    minH: 1 },
    pitPredictor: { title: "Pit Stop Predictor",   tpl: "tpl-pitPredictor", w: 6,   h: 6,   minW: 1,    minH: 1 },
    carStatus:    { title: "Car Status",           tpl: "tpl-carStatus",    w: 6,   h: 4,   minW: 1,    minH: 1 },
    lapData:      { title: "Lap Data",             tpl: "tpl-lapData",      w: 6,   h: 6,   minW: 1,    minH: 1 },
    damage:       { title: "Damage",               tpl: "tpl-damage",       w: 4,   h: 6,   minW: 1,    minH: 1 },
    events:       { title: "Events",               tpl: "tpl-events",       w: 8,   h: 6,   minW: 1,    minH: 1 },
    standings:    { title: "Standings",            tpl: "tpl-standings",    w: 12,  h: 10,  minW: 1,    minH: 1 },
    weather:          { title: "Weather Forecast",     tpl: "tpl-weather",          w: 8,   h: 8,   minW: 1, minH: 1 },
    gapBoard:         { title: "Gap Board",           tpl: "tpl-gapBoard",          w: 8,   h: 7,   minW: 1, minH: 1 },
    gapRing:          { title: "Gap Ring",            tpl: "tpl-gapRing",           w: 6,   h: 16,  minW: 1, minH: 1 },
    qualiStandings:   { title: "Quali Standings",    tpl: "tpl-qualiStandings",     w: 14,  h: 12,  minW: 1, minH: 1 },
    topSpeed:         { title: "Session Top Speeds",   tpl: "tpl-topSpeed",         w: 8,   h: 10,  minW: 1, minH: 1 },
    topSpeedCompare:  { title: "Top Speed Comparison", tpl: "tpl-topSpeedCompare",  w: 4,   h: 10,  minW: 1, minH: 1 },
    lapTimes:         { title: "Lap Times",            tpl: "tpl-lapTimes",         w: 14,  h: 10,  minW: 4, minH: 4 },
};

/** Finer grid (2× columns, 2× rows vs v1); physical size unchanged → scale saved layouts ×2. */
const PRESETS_STORAGE_KEY = "f1telemetry_presets_v2";
const PRESETS_STORAGE_KEY_V1 = "f1telemetry_presets_v1";
const GRID_COLUMNS = 24;
const GRID_CELL_HEIGHT_PX = 30;
const ACTIVE_PRESET_KEY = "f1telemetry_active_preset_v1";
const AUTO_SWITCH_KEY = "f1telemetry_autoswitch_v1";
const LOCK_LAYOUT_KEY = "f1telemetry_lock_layout_v1";
let grid = null;
let activePreset = "race";
let autoSwitchEnabled = true;

/** In-memory drafts per preset for this page session (set when leaving a preset). */
const sessionDrafts = {};

function getWidgetContent(widgetId) {
    const reg = WIDGET_REGISTRY[widgetId];
    if (!reg) return "";
    const tpl = document.getElementById(reg.tpl);
    if (!tpl) return "";
    return tpl.innerHTML;
}

function makeWidgetHtml(widgetId) {
    const reg = WIDGET_REGISTRY[widgetId];
    const content = getWidgetContent(widgetId);
    const bodyClass = widgetId === "events" ? "widget-body widget-body-events" : "widget-body";
    let headerExtra = "";
    if (widgetId === "events") {
        headerExtra = `<button class="event-filter-toggle" id="btnEventFilter" title="Filter events"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></button>`;
    } else if (widgetId === "session") {
        headerExtra = `<button class="event-filter-toggle" id="btnSessionSettings" title="Visible fields"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>`;
    } else if (widgetId === "pitPredictor") {
        headerExtra = `<button type="button" class="pit-times-toggle" id="btnPitTimesSettings" title="Pit times for all tracks"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button>`;
    } else if (widgetId === "tyres") {
        headerExtra = `<button class="tyre-info-btn" title="Legend &amp; temperature scale">?</button>`;
    }
    return `<div class="widget-wrapper" data-widget-id="${widgetId}">
        <div class="widget-header">
            <span class="widget-drag-handle">⠿</span>
            <span class="widget-header-title">${reg.title}</span>
            <span class="widget-grid-size" title="Grid size (columns × rows)"></span>
            ${headerExtra}
            <button class="widget-close-btn" onclick="removeWidget('${widgetId}')" title="Remove widget">✕</button>
        </div>
        <div class="${bodyClass}">${content}</div>
    </div>`;
}

function updateWidgetGridSizeBadges() {
    if (!grid) return;
    const show = document.documentElement.classList.contains("dashboard-debug-layout");
    if (!show) return;
    for (const el of grid.getGridItems()) {
        const node = el.gridstackNode;
        const badge = el.querySelector(".widget-grid-size");
        if (badge && node) badge.textContent = `w${node.w} h${node.h}`;
    }
}

function clearWidgetGridSizeBadges() {
    document.querySelectorAll(".widget-grid-size").forEach(b => { b.textContent = ""; });
}

/** Called from app.js when Debug Mode is toggled in settings. */
window.__f1TelemetrySetDashboardDebugMode = function (enabled) {
    document.documentElement.classList.toggle("dashboard-debug-layout", !!enabled);
    if (enabled) updateWidgetGridSizeBadges();
    else clearWidgetGridSizeBadges();
};

function getCurrentLayout() {
    if (!grid) return [];
    return grid.getGridItems().map(el => {
        const node = el.gridstackNode;
        const wrapper = el.querySelector(".widget-wrapper");
        return {
            id: wrapper?.dataset.widgetId || "",
            x: node.x, y: node.y, w: node.w, h: node.h,
        };
    }).filter(i => i.id);
}

function normalizeLayout(layout) {
    if (!layout || layout.length === 0) return [];
    return [...layout].sort((a, b) =>
        a.id.localeCompare(b.id) || a.x - b.x || a.y - b.y || a.w - b.w || a.h - b.h);
}

function layoutsEqual(a, b) {
    const A = normalizeLayout(a);
    const B = normalizeLayout(b);
    if (A.length !== B.length) return false;
    for (let i = 0; i < A.length; i++) {
        const p = A[i], q = B[i];
        if (p.id !== q.id || p.x !== q.x || p.y !== q.y || p.w !== q.w || p.h !== q.h) return false;
    }
    return true;
}

function scaleLayoutToFinerGrid(layout, factor) {
    if (!Array.isArray(layout)) return [];
    return layout.map(item => ({
        ...item,
        x: Math.round(item.x * factor),
        y: Math.round(item.y * factor),
        w: Math.round(item.w * factor),
        h: Math.round(item.h * factor),
    }));
}

function migratePresetsV1ToV2(presetsV1) {
    const out = {};
    for (const [name, layout] of Object.entries(presetsV1)) {
        out[name] = scaleLayoutToFinerGrid(layout, 2);
    }
    return out;
}

function loadAllPresets() {
    try {
        const rawV2 = localStorage.getItem(PRESETS_STORAGE_KEY);
        if (rawV2) {
            const parsed = JSON.parse(rawV2);
            if (parsed && typeof parsed === "object") return parsed;
        }
        const rawV1 = localStorage.getItem(PRESETS_STORAGE_KEY_V1);
        if (rawV1) {
            const v1 = JSON.parse(rawV1);
            if (v1 && typeof v1 === "object") {
                const migrated = migratePresetsV1ToV2(v1);
                localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(migrated));
                return migrated;
            }
        }
    } catch (_) { /* ignore */ }
    return {};
}

function saveAllPresets(presets) {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

/** Last saved layout for this preset from localStorage (empty grid = []). */
function getSavedLayoutForPreset(presetName) {
    const presets = loadAllPresets();
    const v = presets[presetName];
    return Array.isArray(v) ? v : [];
}

function isPresetDirty() {
    const saved = getSavedLayoutForPreset(activePreset);
    return !layoutsEqual(saved, getCurrentLayout());
}

function updateSavePresetButtonState() {
    const btn = document.getElementById("btnSavePreset");
    const undo = document.getElementById("btnUndoLayout");
    const dirty = isPresetDirty();
    if (btn) {
        btn.classList.toggle("btn-save-preset-dirty", dirty);
        if (dirty) btn.classList.remove("btn-save-preset-saved");
        const showSavedFeedback = btn.classList.contains("btn-save-preset-saved");
        btn.classList.toggle("hidden", !dirty && !showSavedFeedback);
    }
    if (undo) undo.classList.toggle("hidden", !dirty);
}

function persistCurrentPreset() {
    const layout = getCurrentLayout();
    const presets = loadAllPresets();
    presets[activePreset] = layout;
    saveAllPresets(presets);
    sessionDrafts[activePreset] = JSON.parse(JSON.stringify(layout));
}

function loadLayoutForPreset(presetName) {
    if (sessionDrafts[presetName] !== undefined) {
        return JSON.parse(JSON.stringify(sessionDrafts[presetName]));
    }
    return JSON.parse(JSON.stringify(getSavedLayoutForPreset(presetName)));
}

function getActiveWidgetIds() {
    if (!grid) return new Set();
    const ids = new Set();
    grid.getGridItems().forEach(el => {
        const wrapper = el.querySelector(".widget-wrapper");
        if (wrapper?.dataset.widgetId) ids.add(wrapper.dataset.widgetId);
    });
    return ids;
}

function applyLayout(layout) {
    if (!grid) return;
    grid.removeAll();
    grid.batchUpdate();
    for (const item of layout) {
        if (WIDGET_REGISTRY[item.id]) {
            const reg = WIDGET_REGISTRY[item.id];
            grid.addWidget({
                content: makeWidgetHtml(item.id),
                x: item.x, y: item.y,
                w: item.w, h: item.h,
                minW: reg.minW, minH: reg.minH,
                id: item.id,
            });
            wireWidgetEvents(item.id);
        }
    }
    grid.commit();
    updateDropdown();
    updateSavePresetButtonState();
    updateWidgetGridSizeBadges();
}

function switchPreset(presetName) {
    if (presetName === activePreset) return;
    sessionDrafts[activePreset] = getCurrentLayout();
    activePreset = presetName;
    localStorage.setItem(ACTIVE_PRESET_KEY, presetName);
    const layout = loadLayoutForPreset(presetName);
    applyLayout(layout);
    updatePresetButtons();
}

function updatePresetButtons() {
    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.preset === activePreset);
    });
}

function addWidget(widgetId, opts) {
    const reg = WIDGET_REGISTRY[widgetId];
    if (!reg || !grid) return;
    if (getActiveWidgetIds().has(widgetId)) return;

    const html = makeWidgetHtml(widgetId);
    grid.addWidget({
        content: html,
        w: opts?.w ?? reg.w,
        h: opts?.h ?? reg.h,
        x: opts?.x,
        y: opts?.y,
        minW: reg.minW,
        minH: reg.minH,
        id: widgetId,
    });
    wireWidgetEvents(widgetId);
    updateSavePresetButtonState();
    updateDropdown();
    updateWidgetGridSizeBadges();
}

function removeWidget(widgetId) {
    if (!grid) return;
    for (const item of grid.getGridItems()) {
        const wrapper = item.querySelector(".widget-wrapper");
        if (wrapper?.dataset.widgetId === widgetId) {
            grid.removeWidget(item);
            break;
        }
    }
    updateSavePresetButtonState();
    updateDropdown();
}

function wireWidgetEvents(widgetId) {
    if ((widgetId === "topSpeed" || widgetId === "topSpeedCompare") && typeof window.ensureTopSpeedLayoutObserver === "function") {
        window.ensureTopSpeedLayoutObserver();
    }
    if (widgetId === "pitPredictor") {
        const btn = document.getElementById("btnSavePitTime");
        const input = document.getElementById("pitTimeInput");
        if (input && typeof getPitTimeForTrack === "function" && typeof currentTrackId !== "undefined") {
            input.value = getPitTimeForTrack(currentTrackId).toFixed(1);
        }
        if (btn && typeof savePitTime === "function") btn.addEventListener("click", savePitTime);
        if (input && typeof updatePitPredictor === "function") {
            input.addEventListener("change", updatePitPredictor);
            updatePitPredictor();
        }
    }
    if (widgetId === "events" && typeof initEventFilter === "function") {
        initEventFilter();
    }
    if (widgetId === "session" && typeof initSessionSettings === "function") {
        initSessionSettings();
    }
    if (widgetId === "pitPredictor" && typeof initPitTimesPanel === "function") {
        initPitTimesPanel();
    }
    if (widgetId === "tyres") {
        if (typeof _tyreWidgetCache !== "undefined") _tyreWidgetCache.clear();
        if (typeof initTyreInfoTooltip === "function") initTyreInfoTooltip();
    }
    if (widgetId === "lapTimes" && typeof updateLapTimesWidget === "function") {
        updateLapTimesWidget();
    }
}

function updateDropdown() {
    const dropdown = document.getElementById("widgetDropdown");
    if (!dropdown) return;
    const active = getActiveWidgetIds();
    let html = "";
    for (const [id, reg] of Object.entries(WIDGET_REGISTRY)) {
        const isActive = active.has(id);
        html += `<div class="widget-dropdown-item ${isActive ? "active" : ""}" data-id="${id}">
            <span class="widget-dropdown-check">${isActive ? "✓" : ""}</span>
            <span>${reg.title}</span>
        </div>`;
    }
    dropdown.innerHTML = html;

    dropdown.querySelectorAll(".widget-dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
            const id = item.dataset.id;
            if (getActiveWidgetIds().has(id)) removeWidget(id);
            else addWidget(id);
        });
    });
}

// Maps m_sessionType (docs/F1_25_UDP_Spec.md Session Types) → preset. Sync with SESSION_TYPES in telemetry.js.
const SESSION_TYPE_TO_PRESET = {
    1: "practice", 2: "practice", 3: "practice", 4: "practice",
    5: "qualifying", 6: "qualifying", 7: "qualifying", 8: "qualifying", 9: "qualifying",
    10: "qualifying", 11: "qualifying", 12: "qualifying", 13: "qualifying", 14: "qualifying",
    15: "race", 16: "race", 17: "race",
    18: "practice",
};

function onSessionTypeChanged(sessionType) {
    const autoCb = document.getElementById("autoSwitchPreset");
    if (!autoCb || !autoCb.checked || !autoSwitchEnabled) return;
    const preset = SESSION_TYPE_TO_PRESET[sessionType];
    if (preset && preset !== activePreset) {
        switchPreset(preset);
    }
}

function applyDashboardLayoutLock() {
    if (!grid) return;
    const lockToggle = document.getElementById("lockToggle");
    const locked = lockToggle ? lockToggle.checked : localStorage.getItem(LOCK_LAYOUT_KEY) === "true";
    grid.enableMove(!locked);
    grid.enableResize(!locked);
    document.querySelectorAll(".widget-close-btn").forEach(b => { b.style.display = locked ? "none" : ""; });
    document.querySelectorAll(".widget-drag-handle").forEach(h => { h.style.opacity = locked ? "0.2" : "1"; });
}

window.applyDashboardLayoutLock = applyDashboardLayoutLock;

function initWidgets() {
    grid = GridStack.init({
        column: GRID_COLUMNS,
        cellHeight: GRID_CELL_HEIGHT_PX,
        margin: 8,
        handle: ".widget-drag-handle",
        animate: true,
        float: true,
        removable: false,
        disableResize: false,
    }, "#dashboardGrid");

    const autoSwitchCbEarly = document.getElementById("autoSwitchPreset");
    if (autoSwitchCbEarly) {
        autoSwitchCbEarly.checked = localStorage.getItem(AUTO_SWITCH_KEY) !== "false";
    }
    const lockToggleEarly = document.getElementById("lockToggle");
    if (lockToggleEarly) {
        lockToggleEarly.checked = localStorage.getItem(LOCK_LAYOUT_KEY) === "true";
    }
    autoSwitchEnabled = localStorage.getItem(AUTO_SWITCH_KEY) !== "false";

    activePreset = localStorage.getItem(ACTIVE_PRESET_KEY) || "race";
    const layout = loadLayoutForPreset(activePreset);
    applyLayout(layout);
    updatePresetButtons();

    grid.on("change", () => {
        updateSavePresetButtonState();
        updateWidgetGridSizeBadges();
    });

    document.querySelectorAll(".preset-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const autoCb = document.getElementById("autoSwitchPreset");
            if (autoCb && autoCb.checked) autoSwitchEnabled = false;
            switchPreset(btn.dataset.preset);
        });
    });

    const addBtn = document.getElementById("btnAddWidget");
    const dropdown = document.getElementById("widgetDropdown");
    addBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
        if (!dropdown.classList.contains("hidden")) updateDropdown();
    });
    document.addEventListener("click", () => dropdown?.classList.add("hidden"));
    dropdown?.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("btnSavePreset")?.addEventListener("click", () => {
        const btn = document.getElementById("btnSavePreset");
        if (!btn) return;
        const orig = btn.textContent;
        persistCurrentPreset();
        btn.textContent = "Saved";
        btn.classList.add("btn-save-preset-saved");
        updateSavePresetButtonState();
        setTimeout(() => {
            btn.textContent = orig;
            btn.classList.remove("btn-save-preset-saved");
            updateSavePresetButtonState();
        }, 1500);
    });

    const lockToggle = document.getElementById("lockToggle");
    lockToggle?.addEventListener("change", () => {
        localStorage.setItem(LOCK_LAYOUT_KEY, lockToggle.checked ? "true" : "false");
        applyDashboardLayoutLock();
    });

    applyDashboardLayoutLock();

    document.getElementById("btnUndoLayout")?.addEventListener("click", () => {
        const saved = getSavedLayoutForPreset(activePreset);
        const layout = JSON.parse(JSON.stringify(saved));
        sessionDrafts[activePreset] = layout;
        applyLayout(layout);
    });

    updateDropdown();
    updateWidgetGridSizeBadges();
}
