import { useState, type ReactNode } from "react";
import { Button } from "../Button/Button";
import { Badge } from "../Badge/Badge";

export interface HistorySessionSummary {
  slug: string;
  typeName?: string;
  /** ISO timestamp. */
  savedAt?: string;
}

export interface HistoryWeekend {
  folder: string;
  trackName?: string;
  /** Stable key used by the track filter; distinct from the rendered flag image. */
  trackId?: number;
  /** Resolves to `/assets/flags/<flagCode>.svg`; caller looks this up from trackId. */
  flagCode?: string;
  gameYear?: number | string;
  formulaName?: string;
  sessions: HistorySessionSummary[];
}

export interface HistoryFilters {
  track: string;
  game: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: HistoryFilters = { track: "", game: "", from: "", to: "" };

export interface HistorySessionListProps {
  weekends: HistoryWeekend[];
  loading?: boolean;
  loadError?: string | null;
  filters?: HistoryFilters;
  onFilterChange?: (filters: HistoryFilters) => void;
  folderPath: string;
  isCustomFolder?: boolean;
  onFolderPathChange?: (path: string) => void;
  onSelectFolder?: () => void;
  onResetFolder?: () => void;
  onOpenSession: (folder: string, slug: string, weekendName: string) => void;
  onOpenFolder?: (folder: string) => void;
  onDeleteWeekend?: (folder: string, weekendName: string) => void;
  /** Folder currently mid-delete — dims its card and disables its delete button. */
  deletingFolder?: string | null;
  className?: string;
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M1.75 3A1.75 1.75 0 0 0 0 4.75v6.5C0 12.216.784 13 1.75 13h12.5A1.75 1.75 0 0 0 16 11.25V5.75A1.75 1.75 0 0 0 14.25 4H7.5L6 2.5H1.75A1.75 1.75 0 0 0 0 4.25V3z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M6.5 1a.5.5 0 0 0-.5.5V2H3a.5.5 0 0 0 0 1h.06l.62 9.32A1.75 1.75 0 0 0 5.42 14h5.16a1.75 1.75 0 0 0 1.74-1.68L12.94 3H13a.5.5 0 0 0 0-1h-3v-.5a.5.5 0 0 0-.5-.5h-3zM5 5.5a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6zm2.5 0a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6zm2.5 0a.5.5 0 0 1 1 0v6a.5.5 0 0 1-1 0v-6z" />
    </svg>
  );
}

/** Classifies a session for tag colouring: practice / qualifying / race / time_trial. */
function historyTagSessionKind(slug?: string, typeName?: string): string {
  const s = String(slug || "").toLowerCase();
  if (/^fp\d/.test(s) || s.indexOf("practice") !== -1) return "practice";
  if (/^q\d/.test(s) || s.indexOf("quali") !== -1 || s.indexOf("shootout") !== -1 || s === "osq" || s === "oss") return "qualifying";
  if (/^race/.test(s)) return "race";
  if (s === "time_trial" || s === "timetrial" || /^tt/.test(s)) return "time_trial";
  const n = String(typeName || "").toLowerCase();
  if (n.indexOf("practice") !== -1) return "practice";
  if (n.indexOf("quali") !== -1 || n.indexOf("shootout") !== -1) return "qualifying";
  if (n.indexOf("time trial") !== -1) return "time_trial";
  if (n.indexOf("race") !== -1 || n.indexOf("sprint") !== -1) return "race";
  return "";
}

function formatSessionDate(isoStr?: string): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return (
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
      ", " +
      d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    );
  } catch {
    return isoStr;
  }
}

function matchesFilters(w: HistoryWeekend, filters: HistoryFilters): boolean {
  if (filters.track && String(w.trackId ?? "") !== filters.track) return false;
  if (filters.game && String(w.gameYear ?? "") !== filters.game) return false;
  const from = filters.from ? new Date(filters.from + "T00:00:00") : null;
  const to = filters.to ? new Date(filters.to + "T23:59:59.999") : null;
  if (!from && !to) return true;
  if (!w.sessions || w.sessions.length === 0) return false;
  return w.sessions.some((s) => {
    if (!s.savedAt) return false;
    const d = new Date(s.savedAt);
    if (isNaN(d.getTime())) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function buildTrackOptions(weekends: HistoryWeekend[]) {
  const tracks = new Map<string, string>();
  weekends.forEach((w) => {
    if (w.trackId != null) {
      const key = String(w.trackId);
      if (!tracks.has(key)) tracks.set(key, w.trackName || `Track ${key}`);
    }
  });
  return Array.from(tracks.entries()).sort((a, b) => a[1].localeCompare(b[1]));
}

function buildGameOptions(weekends: HistoryWeekend[]) {
  const games = new Set<string>();
  weekends.forEach((w) => {
    if (w.gameYear) games.add(String(w.gameYear));
  });
  return Array.from(games)
    .sort((a, b) => Number(b) - Number(a))
    .map((g) => [g, `F1 ${g}`] as const);
}

interface WeekendCardProps {
  weekend: HistoryWeekend;
  deleting?: boolean;
  onOpen: (folder: string, slug: string, weekendName: string) => void;
  onPickSession: (weekend: HistoryWeekend) => void;
  onOpenFolder?: (folder: string) => void;
  onDelete?: (folder: string, weekendName: string) => void;
}

function WeekendCard({ weekend, deleting, onOpen, onPickSession, onOpenFolder, onDelete }: WeekendCardProps) {
  const displayName = weekend.trackName || weekend.folder;
  const tags: ReactNode[] = [];
  if (weekend.gameYear) {
    tags.push(
      <span key="game" className="history-tag history-tag-game">F1 {weekend.gameYear}</span>
    );
  }
  if (weekend.formulaName) {
    tags.push(
      <span key="formula" className="history-tag history-tag-formula">{weekend.formulaName}</span>
    );
  }
  weekend.sessions.forEach((s, i) => {
    const kind = historyTagSessionKind(s.slug, s.typeName);
    tags.push(
      <span key={`s-${i}`} className={`history-tag history-tag-session${kind ? ` history-tag-${kind}` : ""}`}>
        {s.typeName || s.slug}
      </span>
    );
  });
  const firstDate = weekend.sessions.length > 0 ? formatSessionDate(weekend.sessions[0].savedAt) : "";

  return (
    <div
      className="history-card"
      style={deleting ? { opacity: 0.5, pointerEvents: "none" } : undefined}
      onClick={() => {
        if (weekend.sessions.length === 1) {
          onOpen(weekend.folder, weekend.sessions[0].slug, displayName);
        } else {
          onPickSession(weekend);
        }
      }}
    >
      <button
        type="button"
        className="history-card-open-folder"
        title="Open folder in Explorer"
        aria-label="Open folder"
        onClick={(e) => {
          e.stopPropagation();
          onOpenFolder?.(weekend.folder);
        }}
      >
        <FolderIcon />
      </button>
      <button
        type="button"
        className="history-card-delete"
        title="Delete weekend folder"
        aria-label="Delete weekend"
        disabled={deleting}
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(weekend.folder, displayName);
        }}
      >
        <TrashIcon />
      </button>
      <div className="history-card-header">
        <div className="history-card-title">
          {weekend.flagCode && (
            <img className="history-card-flag" src={`/assets/flags/${weekend.flagCode}.svg`} alt={weekend.flagCode} width={32} height={20} />
          )}
          <span>{displayName}</span>
        </div>
      </div>
      <div className="history-card-tags">{tags}</div>
      <div className="history-card-date">{firstDate}</div>
    </div>
  );
}

function SessionPickerModal({
  weekend,
  onPick,
  onClose,
}: {
  weekend: HistoryWeekend;
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  const displayName = weekend.trackName || weekend.folder;
  return (
    <div className="history-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="history-modal">
        <div className="history-modal-header">
          <span className="history-modal-header-title">
            {weekend.flagCode && (
              <img className="history-modal-flag" src={`/assets/flags/${weekend.flagCode}.svg`} alt={weekend.flagCode} width={32} height={20} />
            )}
            <span className="history-modal-header-text">
              <span className="history-modal-header-track">{displayName}</span>
              <span className="history-modal-header-sub">pick a session</span>
            </span>
          </span>
          <button className="history-modal-close" aria-label="Close" onClick={onClose}>&times;</button>
        </div>
        <div className="history-modal-body">
          {weekend.sessions.map((s) => (
            <button key={s.slug} type="button" className="session-pick-row" onClick={() => onPick(s.slug)}>
              <span className="session-pick-name">{s.typeName || s.slug}</span>
              <span className="session-pick-date">{formatSessionDate(s.savedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Mirrors `.history-list-view` — toolbar (folder + filters) plus the weekend-card grid. */
export function HistorySessionList({
  weekends,
  loading,
  loadError,
  filters = EMPTY_FILTERS,
  onFilterChange,
  folderPath,
  isCustomFolder,
  onFolderPathChange,
  onSelectFolder,
  onResetFolder,
  onOpenSession,
  onOpenFolder,
  onDeleteWeekend,
  deletingFolder = null,
  className,
}: HistorySessionListProps) {
  const [pickerWeekend, setPickerWeekend] = useState<HistoryWeekend | null>(null);

  const trackOptions = buildTrackOptions(weekends);
  const gameOptions = buildGameOptions(weekends);
  const anyFilterActive = !!(filters.track || filters.game || filters.from || filters.to);
  const filtered = weekends.filter((w) => matchesFilters(w, filters));

  function setFilter(patch: Partial<HistoryFilters>) {
    onFilterChange?.({ ...filters, ...patch });
  }

  let body: ReactNode;
  if (loading) {
    body = <div className="history-empty"><p>Loading...</p></div>;
  } else if (loadError) {
    body = <div className="history-empty"><p>Failed to load sessions.</p></div>;
  } else if (weekends.length === 0) {
    body = (
      <div className="history-empty">
        <div className="placeholder-icon">📊</div>
        <h2>No Sessions</h2>
        <p>Recorded sessions will appear here after completing a session.</p>
      </div>
    );
  } else if (filtered.length === 0) {
    body = (
      <div className="history-empty">
        <div className="placeholder-icon">🔍</div>
        <h2>No matches</h2>
        <p>No sessions match the current filters. Try widening the date range or clearing filters.</p>
      </div>
    );
  } else {
    body = (
      <div className="history-container">
        <div className="history-grid">
          {filtered.map((w) => (
            <WeekendCard
              key={w.folder}
              weekend={w}
              deleting={deletingFolder === w.folder}
              onOpen={onOpenSession}
              onPickSession={setPickerWeekend}
              onOpenFolder={onOpenFolder}
              onDelete={onDeleteWeekend}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={["history-list-view", className ?? ""].filter(Boolean).join(" ")}>
      <div className="history-toolbar">
        <div className="history-toolbar-row history-toolbar-folder">
          <div className="history-folder">
            <span className="history-folder-label">Source folder</span>
            <input
              key={folderPath}
              type="text"
              className="history-folder-path"
              id="historyFolderPath"
              title={folderPath}
              defaultValue={folderPath}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v) onFolderPathChange?.(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
            />
            {isCustomFolder && <Badge variant="accent">custom</Badge>}
          </div>
          <div className="history-folder-actions">
            <Button variant="secondary" size="small" onClick={onSelectFolder}>
              <svg className="btn-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              Select Folder
            </Button>
            {isCustomFolder && (
              <Button variant="ghost" size="small" onClick={onResetFolder} title="Restore default Logs/ folder">
                Reset
              </Button>
            )}
          </div>
        </div>
        <div className="history-toolbar-row history-toolbar-filters">
          <div className="history-filter">
            <label htmlFor="historyFilterTrack">Track</label>
            <select id="historyFilterTrack" value={filters.track} onChange={(e) => setFilter({ track: e.target.value })}>
              <option value="">All tracks</option>
              {trackOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="history-filter">
            <label htmlFor="historyFilterGame">Game</label>
            <select id="historyFilterGame" value={filters.game} onChange={(e) => setFilter({ game: e.target.value })}>
              <option value="">All versions</option>
              {gameOptions.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="history-filter">
            <label htmlFor="historyFilterFrom">From</label>
            <input type="date" id="historyFilterFrom" value={filters.from} onChange={(e) => setFilter({ from: e.target.value })} />
          </div>
          <div className="history-filter">
            <label htmlFor="historyFilterTo">To</label>
            <input type="date" id="historyFilterTo" value={filters.to} onChange={(e) => setFilter({ to: e.target.value })} />
          </div>
          {anyFilterActive && (
            <Button
              variant="ghost"
              size="small"
              className="history-filter-clear"
              onClick={() => onFilterChange?.({ track: "", game: "", from: "", to: "" })}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {body}

      {pickerWeekend && (
        <SessionPickerModal
          weekend={pickerWeekend}
          onPick={(slug) => {
            const name = pickerWeekend.trackName || pickerWeekend.folder;
            setPickerWeekend(null);
            onOpenSession(pickerWeekend.folder, slug, name);
          }}
          onClose={() => setPickerWeekend(null)}
        />
      )}
    </div>
  );
}
