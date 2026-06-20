import { useState, type CSSProperties, type ReactNode } from "react";

export interface CompareLapPickerLap {
  lapNum: number;
  lapTimeMs: number;
  valid: boolean;
  pit?: boolean;
  /** 0=green 1=yellow 2=SC 3=VSC 4=red. Numeric or string enum accepted (history payload variance). */
  raceFlag?: number | string | null;
  /** Tyre label shown in the lap-option's meta line, e.g. "Soft". */
  tyre?: string | null;
}

export interface CompareLapPickerDriver {
  carIdx: number;
  name: string;
  /** Resolved livery/team colour (see liveryColours convention) — never a hardcoded team palette. */
  teamColor: string;
  teamId?: number | string | null;
  racePosition?: number | null;
  laps: CompareLapPickerLap[];
}

export interface CompareLapPickerSelection {
  /** Selection key — unique per added lap (the player's own car typically keys on its carIdx; added compare laps get a synthetic key). */
  key: number;
  sourceCarIdx: number;
  lap: number;
  hidden?: boolean;
  isRef?: boolean;
}

export interface CompareLapPickerProps {
  drivers: CompareLapPickerDriver[];
  selected: CompareLapPickerSelection[];
  /** At most this many laps total (reference included). Default 6. */
  maxTotal?: number;
  /** At most this many laps per team. Default 3. */
  maxPerTeam?: number;
  redFlagClearedAfterLap?: number | null;
  onAddLap: (carIdx: number, lapNum: number) => void;
  onRemove: (key: number) => void;
  onSetRef: (key: number) => void;
  onToggleVisibility: (key: number) => void;
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function shortDriverName(name: string | null | undefined): string {
  const raw = String(name || "").trim();
  if (!raw) return "Unknown";
  const bracketMatch = raw.match(/\[([A-Za-z0-9]{3,})\]/);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  if (/^[A-Za-z0-9_]{2,16}$/.test(raw) && raw.indexOf(" ") < 0) return raw;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1];
    if (last.length <= 3) return (first + ". " + last).trim();
    return (first + ". " + last.substring(0, 12)).trim();
  }
  return raw.length > 12 ? raw.substring(0, 12) : raw;
}

function formatLapTime(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return m + ":" + s.padStart(6, "0");
}

function normalizeRaceFlag(flag: number | string | null | undefined): number {
  if (flag == null) return 0;
  if (typeof flag === "number") return flag;
  const text = String(flag).trim().toLowerCase();
  if (!text) return 0;
  if (text === "0" || text === "green") return 0;
  if (text === "1" || text === "yellow") return 1;
  if (text === "2" || text === "sc" || text === "safetycar" || text === "safety_car" || text === "safety car") return 2;
  if (text === "3" || text === "vsc" || text === "virtualsafetycar" || text === "virtual_safety_car" || text === "virtual safety car") return 3;
  if (text === "4" || text === "red" || text === "redflag" || text === "red_flag" || text === "red flag") return 4;
  return 0;
}

/** Mirrors `compareLapTagsHtml` — PIT / OUT / SC / VSC / RF only (no blue/yellow, unlike the lap-grid's tag set). */
function compareLapTags(
  lap: CompareLapPickerLap | undefined,
  driverLaps: CompareLapPickerLap[],
  redFlagClearedAfterLap: number | null | undefined
): ReactNode[] {
  if (!lap) return [];
  const tags: ReactNode[] = [];
  if (lap.pit) {
    tags.push(<span key="pit" className="lap-tag lap-tag--pit" title="Pit stop on this lap">PIT</span>);
  } else {
    const prev = driverLaps.find((l) => l.lapNum === lap.lapNum - 1);
    if (prev?.pit) tags.push(<span key="out" className="lap-tag lap-tag--out" title="Out lap (after pit)">OUT</span>);
  }
  let rf = normalizeRaceFlag(lap.raceFlag);
  if (rf === 4 && redFlagClearedAfterLap != null && lap.lapNum > redFlagClearedAfterLap) rf = 0;
  if (rf === 2) tags.push(<span key="flag" className="lap-tag lap-tag--sc" title="Safety Car">SC</span>);
  else if (rf === 3) tags.push(<span key="flag" className="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>);
  else if (rf === 4) tags.push(<span key="flag" className="lap-tag lap-tag--rf" title="Red Flag">RF</span>);
  return tags;
}

function LapTagList({ tags }: { tags: ReactNode[] }) {
  if (!tags.length) return null;
  return <span className="tc-lap-tag-list">{tags}</span>;
}

/**
 * Compare-mode Driver/Lap Picker — mirrors `DriverPicker(opts)` with `compareCardMode: true`
 * from historyDetail.js. The default checkbox-row picker (History Lap Chart, etc.) is a
 * separate mode of that same function and isn't ported here.
 *
 * Comparison limits (`maxTotal`/`maxPerTeam`) mirror the app's hardcoded MAX_COMPARE_TOTAL=6 /
 * MAX_COMPARE_PER_TEAM=3 — kept as props since they're cheap to vary, not because the app varies them.
 */
export function CompareLapPicker({
  drivers,
  selected,
  maxTotal = 6,
  maxPerTeam = 3,
  redFlagClearedAfterLap = null,
  onAddLap,
  onRemove,
  onSetRef,
  onToggleVisibility,
  className,
}: CompareLapPickerProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedCarIdx, setExpandedCarIdx] = useState<number | null>(null);

  const driverByIdx = new Map(drivers.map((d) => [d.carIdx, d]));
  function teamIdOf(carIdx: number): string {
    const d = driverByIdx.get(carIdx);
    return d?.teamId != null ? String(d.teamId) : "_" + carIdx;
  }

  let total = 0;
  const byTeam: Record<string, number> = {};
  selected.forEach((sel) => {
    total++;
    const tid = teamIdOf(sel.sourceCarIdx);
    byTeam[tid] = (byTeam[tid] || 0) + 1;
  });
  const atTotalCap = total >= maxTotal;

  const sortedSelected = [...selected].sort((a, b) => a.sourceCarIdx - b.sourceCarIdx || a.lap - b.lap);

  function isLapDuplicate(carIdx: number, lapNum: number): boolean {
    return selected.some((sel) => sel.sourceCarIdx === carIdx && sel.lap === lapNum);
  }

  function closeModal() {
    setModalOpen(false);
    setExpandedCarIdx(null);
  }

  function pickLap(carIdx: number, lapNum: number) {
    onAddLap(carIdx, lapNum);
    closeModal();
  }

  return (
    <div className={cx("history-driver-picker", className)}>
      <div className="driver-picker-header">Compare laps</div>
      <div className="tc-lap-card-list">
        {sortedSelected.map((item) => {
          const d = driverByIdx.get(item.sourceCarIdx);
          if (!d) return null;
          const lapInfo = d.laps.find((l) => l.lapNum === item.lap);
          const tags = compareLapTags(lapInfo, d.laps, redFlagClearedAfterLap);
          return (
            <div
              key={item.key}
              className={cx("tc-lap-card", item.hidden && "is-muted")}
              style={{ "--tc-card-color": d.teamColor } as CSSProperties}
              onClick={() => onToggleVisibility(item.key)}
            >
              <div className="tc-lap-card-info">
                <div className="tc-lap-card-name-row">
                  <span className="tc-lap-card-name" title={d.name || "Car " + item.sourceCarIdx}>
                    {shortDriverName(d.name || "Car " + item.sourceCarIdx)}
                  </span>
                  <LapTagList tags={tags} />
                  {item.isRef && <span className="driver-ref-badge">REF</span>}
                </div>
                <span className="tc-lap-card-lap">Lap {item.lap}</span>
              </div>
              <div className="tc-lap-card-actions">
                {!item.isRef && (
                  <button
                    type="button"
                    className="tc-lap-card-ref"
                    title="Set as reference lap"
                    onClick={(e) => { e.stopPropagation(); onSetRef(item.key); }}
                  >
                    REF
                  </button>
                )}
                <button
                  type="button"
                  className="tc-lap-card-vis"
                  title="Show/hide lap"
                  onClick={(e) => { e.stopPropagation(); onToggleVisibility(item.key); }}
                >
                  👁
                </button>
                <button
                  type="button"
                  className="tc-lap-card-remove"
                  title="Remove lap"
                  onClick={(e) => { e.stopPropagation(); onRemove(item.key); }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
        <button
          type="button"
          className="tc-lap-card tc-lap-card-add"
          disabled={atTotalCap}
          title={atTotalCap ? `Maximum ${maxTotal} laps (reference included)` : undefined}
          onClick={() => setModalOpen(true)}
        >
          + Add lap
        </button>
      </div>

      {modalOpen && (
        <div
          className="history-modal-overlay history-modal-overlay--compare-laps"
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div className="history-modal">
            <div className="history-modal-header">
              <span className="history-modal-header-title">Add lap to compare</span>
              <button className="history-modal-close" aria-label="Close" onClick={closeModal}>&times;</button>
            </div>
            <div className="history-modal-body">
              <div className="tc-lap-modal">
                <p className="tc-lap-modal-title">Click a driver to expand laps. Already-added laps are hidden.</p>
                <div className="tc-lap-accordion" role="list">
                  {drivers.map((d) => {
                    const isOpen = expandedCarIdx === d.carIdx;
                    const teamCapped = (byTeam[teamIdOf(d.carIdx)] || 0) >= maxPerTeam;
                    const lapsAvailable = [...d.laps]
                      .sort((a, b) => a.lapNum - b.lapNum)
                      .filter((l) => !isLapDuplicate(d.carIdx, l.lapNum));
                    return (
                      <div key={d.carIdx} className={cx("tc-lap-acc-item", isOpen && "is-open")} role="listitem">
                        <button
                          type="button"
                          className="tc-lap-acc-trigger"
                          aria-expanded={isOpen}
                          onClick={() => setExpandedCarIdx(isOpen ? null : d.carIdx)}
                        >
                          <span className="driver-dot" style={{ background: d.teamColor }} />
                          <span className="tc-lap-acc-name">
                            {d.racePosition ? <span className="driver-race-pos">P{d.racePosition}</span> : null}{" "}
                            {shortDriverName(d.name || "Car " + d.carIdx)}
                          </span>
                          <span className="tc-lap-acc-chevron" aria-hidden="true" />
                        </button>
                        {isOpen && (
                          <div className="tc-lap-acc-panel">
                            {teamCapped ? (
                              <div className="tc-lap-empty">
                                Max {maxPerTeam} laps per team — remove one to add another for this team.
                              </div>
                            ) : lapsAvailable.length === 0 ? (
                              <div className="tc-lap-empty">No laps left to add for this driver (or no lap data).</div>
                            ) : (
                              <div className="tc-lap-acc-laps">
                                {lapsAvailable.map((l) => (
                                  <button
                                    key={l.lapNum}
                                    type="button"
                                    className="tc-lap-option"
                                    onClick={() => pickLap(d.carIdx, l.lapNum)}
                                  >
                                    <span className="tc-lap-option-main">
                                      Lap {l.lapNum}
                                      <LapTagList tags={compareLapTags(l, d.laps, redFlagClearedAfterLap)} />
                                    </span>
                                    <span className="tc-lap-option-meta">
                                      {formatLapTime(l.lapTimeMs) + " · " + (l.tyre || "—") + (l.valid ? "" : " · invalid")}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
