import type { CSSProperties } from "react";

const ERS_MODE_TAGS = ["", "MED", "HOT", "OT"];

export interface FocusPanelDriverSample {
  spd: number;
  rpm: number;
  /** 0 = neutral, -1 = reverse, 1-8 = forward gears. */
  gr: number;
  /** 0-100 */
  thr: number;
  /** 0-100 */
  brk: number;
  /** -100..100, negative = left lock. */
  str: number;
  drs: boolean;
  /** 0-100 */
  ers: number;
  /** 0=off 1=MED 2=HOT 3=OT */
  ersMode?: number;
}

export interface FocusPanelDriver {
  key: string | number;
  /** Pre-resolved display name (chip label / short name / "You" / "Reference" fallback already applied). */
  name: string;
  /** Resolved livery/team colour — never a hardcoded team palette. */
  color: string;
  isReference?: boolean;
  sample?: FocusPanelDriverSample | null;
}

export interface FocusPanelProps {
  drivers: FocusPanelDriver[];
  /** Current hover/scrub distance in metres, or null when nothing is hovered. */
  distance?: number | null;
  lateralOffset?: number | null;
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function clampPct(v: number): number {
  return Math.max(0, Math.min(100, v));
}

function GearDial({ gear }: { gear: number | string }) {
  return (
    <div className="tc-rd-gear">
      <svg viewBox="0 0 48 48" width={46} height={46} aria-hidden="true">
        <circle cx={24} cy={24} r={21} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={3} />
        <text x={24} y={31} textAnchor="middle" className="tc-rd-gear-num">
          {gear}
        </text>
      </svg>
      <span className="tc-rd-cap">gear</span>
    </div>
  );
}

function SteerIndicator({ str }: { str: number }) {
  const ang = Math.max(-45, Math.min(45, (str / 100) * 45));
  const lbl = (str > 0 ? "R" : str < 0 ? "L" : "") + Math.abs(Math.round(str)) + "°";
  return (
    <div className="tc-rd-steer">
      <svg viewBox="0 0 56 34" width={56} height={34} aria-hidden="true">
        <path d="M6 28 A22 22 0 0 1 50 28" fill="none" stroke="rgba(255,255,255,.14)" strokeWidth={3} />
        <line
          x1={28}
          y1={28}
          x2={28}
          y2={9}
          stroke="var(--rd)"
          strokeWidth={2.5}
          strokeLinecap="round"
          transform={`rotate(${ang.toFixed(1)} 28 28)`}
        />
      </svg>
      <span className="tc-rd-cap">{lbl}</span>
    </div>
  );
}

function PedalBar({ kind, value }: { kind: "thr" | "brk"; value: number }) {
  return (
    <div className={`tc-rd-bar tc-rd-bar--${kind}`}>
      <span className="tc-rd-bar-fill" style={{ width: `${value}%` }} />
      <span className="tc-rd-bar-lbl">{Math.round(value)}%</span>
    </div>
  );
}

function ReadoutCard({ driver }: { driver: FocusPanelDriver }) {
  const s = driver.sample;
  const isRef = !!driver.isReference;
  const gear = s ? (s.gr > 0 ? s.gr : s.gr === 0 ? "N" : "R") : "—";
  const thr = s ? clampPct(s.thr) : 0;
  const brk = s ? clampPct(s.brk) : 0;
  const ersMode = s ? ERS_MODE_TAGS[s.ersMode || 0] || "" : "";
  return (
    <div className={cx("tc-rd", isRef ? "tc-rd--ref" : "tc-rd--cmp")} style={{ "--rd": driver.color } as CSSProperties}>
      <div className="tc-rd-head">
        <span className="tc-rd-dot" />
        <span className="tc-rd-name" title={driver.name}>
          {driver.name}
        </span>
        {isRef ? <span className="tc-rd-tag tc-rd-tag--ref">REF</span> : <span className="tc-rd-tag">YOU</span>}
      </div>
      <div className="tc-rd-body">
        <div className="tc-rd-stats">
          <div className="tc-rd-spd">
            <b>{s ? Math.round(s.spd) : "—"}</b>
            <span>km/h</span>
          </div>
          <div className="tc-rd-rpm">
            <b>{s ? Math.round(s.rpm).toLocaleString() : "—"}</b>
            <span>rpm</span>
          </div>
        </div>
        <GearDial gear={gear} />
        <SteerIndicator str={s ? s.str : 0} />
      </div>
      <div className="tc-rd-pedals">
        <PedalBar kind="thr" value={thr} />
        <PedalBar kind="brk" value={brk} />
      </div>
      <div className="tc-rd-chips">
        <span className={cx("tc-rd-chip", "tc-rd-chip--drs", s?.drs ? "is-on" : "is-off")}>DRS</span>
        {ersMode && <span className="tc-rd-chip">{ersMode}</span>}
        {s && <span className="tc-rd-chip">ERS {Math.round(s.ers || 0)}%</span>}
      </div>
    </div>
  );
}

/** Mirrors `renderFocusPanel()` / `readoutCardHtml()` from telemetryCompare.js — the `#tcFocusPanel` "You vs Reference" instrument cards. */
export function FocusPanel({ drivers, distance = null, lateralOffset = null, className }: FocusPanelProps) {
  const ref = drivers.find((d) => d.isReference) ?? null;
  const compares = drivers.filter((d) => !d.isReference);
  const ordered = ref ? [...compares, ref] : compares;

  const subText =
    distance == null
      ? "Hover the chart or track map to inspect values"
      : `d = ${Math.round(distance)} m${lateralOffset != null ? ` · offset ${lateralOffset.toFixed(2)} m` : ""}`;

  return (
    <aside className={cx("tc-focus", className)}>
      <div className="tc-focus-head">
        <h4>You vs Reference</h4>
      </div>
      <div className="tc-focus-sub">{subText}</div>
      {ordered.length > 0 && (
        <div className="tc-readouts">
          {ordered.map((d) => (
            <ReadoutCard key={d.key} driver={d} />
          ))}
        </div>
      )}
    </aside>
  );
}
