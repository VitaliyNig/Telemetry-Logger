"use strict";

const WIDGET_REGISTRY = {
    session:      { title: "Session",              tpl: "tpl-session",      w: 4, h: 2, minW: 2, minH: 2 },
    telemetry:    { title: "Car Telemetry",        tpl: "tpl-telemetry",    w: 4, h: 3, minW: 3, minH: 2 },
    tyres:        { title: "Tyres",                tpl: "tpl-tyres",        w: 2, h: 3, minW: 2, minH: 2 },
    tyreSets:     { title: "Available Tyre Sets",  tpl: "tpl-tyreSets",     w: 6, h: 3, minW: 3, minH: 2 },
    pitPredictor: { title: "Pit Stop Predictor",   tpl: "tpl-pitPredictor", w: 4, h: 3, minW: 2, minH: 2 },
    carStatus:    { title: "Car Status",           tpl: "tpl-carStatus",    w: 3, h: 2, minW: 2, minH: 2 },
    lapData:      { title: "Lap Data",             tpl: "tpl-lapData",      w: 3, h: 3, minW: 2, minH: 2 },
    damage:       { title: "Damage",               tpl: "tpl-damage",       w: 2, h: 3, minW: 2, minH: 2 },
    events:       { title: "Events",               tpl: "tpl-events",       w: 4, h: 3, minW: 2, minH: 2 },
    standings:    { title: "Standings",             tpl: "tpl-standings",    w: 6, h: 5, minW: 3, minH: 3 },
    weather:          { title: "Weather Forecast",     tpl: "tpl-weather",         w: 6, h: 3, minW: 3, minH: 2 },
    gapBoard:         { title: "Gap Board",           tpl: "tpl-gapBoard",        w: 5, h: 3, minW: 3, minH: 2 },
    qualiStandings:   { title: "Quali Standings",    tpl: "tpl-qualiStandings",  w: 7, h: 6, minW: 4, minH: 3 },
};

const PRESETS_STORAGE_KEY = "f1telemetry_presets_v1";
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
    return `<div class="widget-wrapper" data-widget-id="${widgetId}">
        <div class="widget-header">
            <span class="widget-drag-handle">⠿</span>
            <span class="widget-header-title">${reg.title}</span>
            <button class="widget-close-btn" onclick="removeWidget('${widgetId}')" title="Remove widget">✕</button>
        </div>
        <div class="widget-body">${content}</div>
    </div>`;
}

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

function loadAllPresets() {
    try {
        const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
        if (raw) return JSON.parse(raw);
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
    if (btn) btn.classList.toggle("btn-save-preset-dirty", dirty);
    if (undo) undo.hidden = !dirty;
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
    if (widgetId === "pitPredictor") {
        const btn = document.getElementById("btnSavePitTime");
        const input = document.getElementById("pitTimeInput");
        if (btn && typeof savePitTime === "function") btn.addEventListener("click", savePitTime);
        if (input && typeof updatePitPredictor === "function") input.addEventListener("change", updatePitPredictor);
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

const SESSION_TYPE_TO_PRESET = {
    1: "practice", 2: "practice", 3: "practice", 4: "practice",
    5: "qualifying", 6: "qualifying", 7: "qualifying", 8: "qualifying", 9: "qualifying",
    10: "race", 11: "race", 12: "race",
    13: "practice",
    14: "qualifying", 15: "qualifying", 16: "qualifying", 17: "qualifying", 18: "qualifying",
    19: "race",
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
        column: 12,
        cellHeight: 60,
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

    grid.on("change", updateSavePresetButtonState);

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
        persistCurrentPreset();
        const btn = document.getElementById("btnSavePreset");
        const orig = btn.textContent;
        btn.textContent = "Saved!";
        setTimeout(() => { btn.textContent = orig; }, 1500);
        updateSavePresetButtonState();
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
}
