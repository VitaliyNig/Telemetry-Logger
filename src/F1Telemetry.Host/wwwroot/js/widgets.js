"use strict";

const WIDGET_REGISTRY = {
    session:      { title: "Session",             tpl: "tpl-session",      w: 4, h: 2, minW: 2, minH: 2 },
    telemetry:    { title: "Car Telemetry",       tpl: "tpl-telemetry",    w: 4, h: 3, minW: 3, minH: 2 },
    tyres:        { title: "Tyres",               tpl: "tpl-tyres",        w: 2, h: 3, minW: 2, minH: 2 },
    tyreSets:     { title: "Available Tyre Sets",  tpl: "tpl-tyreSets",    w: 6, h: 3, minW: 3, minH: 2 },
    pitPredictor: { title: "Pit Stop Predictor",  tpl: "tpl-pitPredictor", w: 4, h: 3, minW: 2, minH: 2 },
    carStatus:    { title: "Car Status",          tpl: "tpl-carStatus",    w: 3, h: 2, minW: 2, minH: 2 },
    lapData:      { title: "Lap Data",            tpl: "tpl-lapData",      w: 3, h: 3, minW: 2, minH: 2 },
    damage:       { title: "Damage",              tpl: "tpl-damage",       w: 2, h: 3, minW: 2, minH: 2 },
    events:       { title: "Events",              tpl: "tpl-events",       w: 4, h: 3, minW: 2, minH: 2 },
    standings:    { title: "Standings",            tpl: "tpl-standings",    w: 6, h: 5, minW: 3, minH: 3 },
};

const DEFAULT_LAYOUT = [
    { id: "session",      x: 0, y: 0,  w: 4, h: 2 },
    { id: "telemetry",    x: 4, y: 0,  w: 4, h: 3 },
    { id: "tyres",        x: 8, y: 0,  w: 2, h: 3 },
    { id: "lapData",      x: 0, y: 2,  w: 3, h: 3 },
    { id: "carStatus",    x: 3, y: 2,  w: 3, h: 2 },
    { id: "damage",       x: 10, y: 0, w: 2, h: 3 },
    { id: "pitPredictor", x: 6, y: 3,  w: 4, h: 3 },
    { id: "events",       x: 0, y: 5,  w: 4, h: 3 },
    { id: "tyreSets",     x: 4, y: 6,  w: 6, h: 3 },
    { id: "standings",    x: 0, y: 8,  w: 6, h: 5 },
];

const LAYOUT_KEY = "f1telemetry_layout_v1";
let grid = null;

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

function saveLayout() {
    if (!grid) return;
    const items = grid.getGridItems();
    const layout = items.map(el => {
        const node = el.gridstackNode;
        const wrapper = el.querySelector(".widget-wrapper");
        return {
            id: wrapper?.dataset.widgetId || "",
            x: node.x, y: node.y, w: node.w, h: node.h,
        };
    }).filter(i => i.id);
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

function loadLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (raw) {
            const layout = JSON.parse(raw);
            if (Array.isArray(layout) && layout.length > 0) return layout;
        }
    } catch (_) { /* ignore */ }
    return null;
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

function addWidget(widgetId, opts) {
    const reg = WIDGET_REGISTRY[widgetId];
    if (!reg || !grid) return;
    const active = getActiveWidgetIds();
    if (active.has(widgetId)) return;

    const html = makeWidgetHtml(widgetId);
    const w = opts?.w ?? reg.w;
    const h = opts?.h ?? reg.h;
    const x = opts?.x;
    const y = opts?.y;

    grid.addWidget({ content: html, w, h, x, y, minW: reg.minW, minH: reg.minH, id: widgetId });
    wireWidgetEvents(widgetId);
    saveLayout();
    updateDropdown();
}

function removeWidget(widgetId) {
    if (!grid) return;
    const items = grid.getGridItems();
    for (const item of items) {
        const wrapper = item.querySelector(".widget-wrapper");
        if (wrapper?.dataset.widgetId === widgetId) {
            grid.removeWidget(item);
            break;
        }
    }
    saveLayout();
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
            if (getActiveWidgetIds().has(id)) {
                removeWidget(id);
            } else {
                addWidget(id);
            }
        });
    });
}

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

    const layout = loadLayout() || DEFAULT_LAYOUT;
    grid.batchUpdate();
    for (const item of layout) {
        if (WIDGET_REGISTRY[item.id]) {
            const reg = WIDGET_REGISTRY[item.id];
            const html = makeWidgetHtml(item.id);
            grid.addWidget({
                content: html,
                x: item.x, y: item.y,
                w: item.w, h: item.h,
                minW: reg.minW, minH: reg.minH,
                id: item.id,
            });
            wireWidgetEvents(item.id);
        }
    }
    grid.commit();

    grid.on("change", saveLayout);

    const addBtn = document.getElementById("btnAddWidget");
    const dropdown = document.getElementById("widgetDropdown");
    addBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
        if (!dropdown.classList.contains("hidden")) updateDropdown();
    });
    document.addEventListener("click", () => dropdown?.classList.add("hidden"));
    dropdown?.addEventListener("click", (e) => e.stopPropagation());

    const lockToggle = document.getElementById("lockToggle");
    lockToggle?.addEventListener("change", () => {
        const locked = lockToggle.checked;
        grid.enableMove(!locked);
        grid.enableResize(!locked);
        document.querySelectorAll(".widget-close-btn").forEach(b => b.style.display = locked ? "none" : "");
        document.querySelectorAll(".widget-drag-handle").forEach(h => h.style.opacity = locked ? "0.2" : "1");
    });

    document.getElementById("btnResetLayout")?.addEventListener("click", () => {
        localStorage.removeItem(LAYOUT_KEY);
        grid.removeAll();
        grid.batchUpdate();
        for (const item of DEFAULT_LAYOUT) {
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
        saveLayout();
        updateDropdown();
    });

    updateDropdown();
}
