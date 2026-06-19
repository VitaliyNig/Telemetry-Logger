export interface GapRingDriver {
  carIdx: number;
  /** Race position, 1-based. */
  pos: number;
  /** Gap to the race leader, ms. Ignored when pos === 1. */
  gapLeaderMs: number | null;
  /** Gap to the car directly ahead, ms. Ignored when pos === 1. */
  gapAheadMs: number | null;
  /** Current lap distance, metres — not normalized to the lap length. */
  lapDistanceMeters: number;
  name: string;
  /** Resolved livery/team colour (see liveryColours convention) — never a hardcoded team palette. */
  teamColor: string;
  isPlayer?: boolean;
}

export interface GapRingProps {
  drivers: GapRingDriver[];
  lapLengthMeters: number;
  className?: string;
}

const R_DOT = 76;
const R_OUTER = R_DOT + 38;
const R_NAME = R_DOT + 14;
const R_INNER = R_DOT - 24;
const ANG_STACK_RAD = 0.052;

function formatOuterMs(ms: number | null, isLeader: boolean) {
  if (isLeader) return "—";
  if (ms == null || ms <= 0) return "—";
  return "+" + (ms / 1000).toFixed(3);
}

function formatIntervalMs(ms: number | null, isLeader: boolean) {
  if (isLeader) return "LEAD";
  if (ms == null || ms <= 0) return "—";
  return "+" + (ms / 1000).toFixed(3);
}

function normalizeLapDistance(d: number, lapLen: number) {
  if (!Number.isFinite(d) || lapLen <= 0) return 0;
  let x = d % lapLen;
  if (x < 0) x += lapLen;
  if (x < 0) x = 0;
  if (x >= lapLen) x = lapLen - 1e-6;
  return x;
}

/** 12 o'clock = lap distance 0 (start/finish). */
function lapDistanceToAngleRad(lapDistNorm: number, lapLen: number) {
  const t = lapLen > 0 ? lapDistNorm / lapLen : 0;
  return -Math.PI / 2 + t * 2 * Math.PI;
}

function driverAbbrFromName(fullName: string) {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts[parts.length - 1];
  return (last.length <= 3 ? last : last.slice(0, 3)).toUpperCase();
}

/** Mirrors `tpl-gapRing` / `updateGapRing` — radial track-position ring plus ahead/behind gap readout. */
export function GapRing({ drivers, lapLengthMeters, className }: GapRingProps) {
  const sorted = [...drivers].sort((a, b) => a.pos - b.pos);
  const n = sorted.length;

  const wrapClass = ["card", "gap-ring-card", className ?? ""].filter(Boolean).join(" ");

  if (n === 0) {
    return (
      <div className={wrapClass}>
        <div className="gap-ring-body">
          <div className="gap-ring-svg-wrap">
            <svg className="gap-ring-svg" viewBox="-118 -118 236 236" role="img" aria-label="Gaps on track order" />
          </div>
          <div className="gap-ring-center">
            <span className="gap-ring-c-dim">No data</span>
          </div>
        </div>
      </div>
    );
  }

  const fontOuter = n > 16 ? 6.5 : n > 12 ? 7.5 : 8.5;
  const fontName = n > 16 ? 8 : n > 12 ? 9 : 10;
  const fontInner = n > 16 ? 6.5 : n > 12 ? 7.5 : 8.5;

  const angBucket = new Map<number, number>();
  function stackIndexForAngle(ang: number) {
    const key = Math.round(ang / 0.04);
    const c = angBucket.get(key) ?? 0;
    angBucket.set(key, c + 1);
    return c;
  }

  const placed = sorted.map((d) => {
    const lapDistNorm = normalizeLapDistance(d.lapDistanceMeters, lapLengthMeters);
    const angRaw = lapDistanceToAngleRad(lapDistNorm, lapLengthMeters);
    const stack = stackIndexForAngle(angRaw);
    const angDraw = angRaw + stack * ANG_STACK_RAD;
    return { d, cos: Math.cos(angDraw), sin: Math.sin(angDraw) };
  });

  const pi = sorted.findIndex((d) => d.isPlayer);
  const player = pi >= 0 ? sorted[pi] : null;
  const ahead = player && pi > 0 ? sorted[pi - 1] : null;
  const behind = player && pi < n - 1 ? sorted[pi + 1] : null;

  return (
    <div className={wrapClass}>
      <div className="gap-ring-body">
        <div className="gap-ring-svg-wrap">
          <svg className="gap-ring-svg" viewBox="-118 -118 236 236" role="img" aria-label="Gaps on track order">
            <circle cx={0} cy={0} r={R_DOT} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
            <line x1={0} y1={-46} x2={0} y2={-80} stroke="rgba(255,255,255,0.2)" strokeWidth={1.5} strokeLinecap="round" />
            <text x={0} y={-84} className="gap-ring-sf" fontSize={8} fill="rgba(255,255,255,0.4)" textAnchor="middle">
              S/F
            </text>

            {placed.map(({ d, cos, sin }) => (
              <line
                key={`spoke-${d.carIdx}`}
                x1={0}
                y1={0}
                x2={cos * R_OUTER}
                y2={sin * R_OUTER}
                className="gap-ring-spoke"
                stroke="rgba(255,255,255,0.09)"
                strokeWidth={0.5}
              />
            ))}

            {placed.map(({ d, cos, sin }) => (
              <circle
                key={`dot-${d.carIdx}`}
                cx={cos * R_DOT}
                cy={sin * R_DOT}
                r={d.isPlayer ? 5.5 : 4.5}
                fill={d.teamColor}
                fillOpacity={0.92}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={d.isPlayer ? 1.8 : 1.1}
              />
            ))}

            {placed.map(({ d, cos, sin }) => {
              const isLeader = d.pos === 1;
              return (
                <g key={`labels-${d.carIdx}`}>
                  <text x={cos * R_OUTER} y={sin * R_OUTER} className="gap-ring-txt-outer" fontSize={fontOuter}>
                    {formatOuterMs(d.gapLeaderMs, isLeader)}
                  </text>
                  <text
                    x={cos * R_NAME}
                    y={sin * R_NAME}
                    className={["gap-ring-txt-name", d.isPlayer ? "gap-ring-txt-player" : ""].filter(Boolean).join(" ")}
                    fill={d.teamColor}
                    fontSize={fontName}
                    fontWeight={600}
                  >
                    {driverAbbrFromName(d.name)}
                  </text>
                  <text x={cos * R_INNER} y={sin * R_INNER} className="gap-ring-txt-inner" fontSize={fontInner}>
                    {formatIntervalMs(d.gapAheadMs, isLeader)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="gap-ring-center">
          {ahead ? (
            <div className="gap-ring-c-neighbor gap-ring-c-ahead" style={{ color: ahead.teamColor }}>
              P{ahead.pos} {driverAbbrFromName(ahead.name)}
            </div>
          ) : (
            <div className="gap-ring-c-neighbor gap-ring-c-ahead">
              <span className="gap-ring-c-dim">Leader</span>
            </div>
          )}

          <div className="gap-ring-c-gap gap-ring-c-gap-ahead" style={ahead ? { color: ahead.teamColor } : undefined}>
            {ahead && player && player.gapAheadMs != null && player.gapAheadMs >= 0 ? (
              `-${(player.gapAheadMs / 1000).toFixed(3)}`
            ) : (
              <span className="gap-ring-c-dim">—</span>
            )}
          </div>

          <div className="gap-ring-c-player">{player ? `P${player.pos} ${driverAbbrFromName(player.name)}` : <span className="gap-ring-c-dim">No player car</span>}</div>

          <div className="gap-ring-c-gap gap-ring-c-gap-behind" style={behind ? { color: behind.teamColor } : undefined}>
            {behind && behind.gapAheadMs != null && behind.gapAheadMs >= 0 ? (
              `+${(behind.gapAheadMs / 1000).toFixed(3)}`
            ) : (
              <span className="gap-ring-c-dim">—</span>
            )}
          </div>

          {behind ? (
            <div className="gap-ring-c-neighbor gap-ring-c-behind" style={{ color: behind.teamColor }}>
              P{behind.pos} {driverAbbrFromName(behind.name)}
            </div>
          ) : (
            <div className="gap-ring-c-neighbor gap-ring-c-behind">
              <span className="gap-ring-c-dim">—</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
