import { GaugeBar } from "../GaugeBar/GaugeBar";
import type { GaugeBarTone } from "../GaugeBar/GaugeBar";

export interface DamageValues {
  /** All fields are 0-100 damage percentages, straight from `CarDamageData`. */
  frontLeftWing: number;
  frontRightWing: number;
  rearWing: number;
  floor: number;
  engine: number;
  gearbox: number;
}

export interface DamageProps {
  damage: DamageValues;
  className?: string;
}

function damageTone(pct: number): GaugeBarTone {
  if (pct > 50) return "danger";
  if (pct > 25) return "warning";
  return "safe";
}

const ROWS: { key: keyof DamageValues; label: string }[] = [
  { key: "frontLeftWing", label: "FL Wing" },
  { key: "frontRightWing", label: "FR Wing" },
  { key: "rearWing", label: "Rear Wing" },
  { key: "floor", label: "Floor" },
  { key: "engine", label: "Engine" },
  { key: "gearbox", label: "Gearbox" },
];

/** Mirrors `tpl-damage` — six wing/floor/engine/gearbox wear bars, color-coded by severity. */
export function Damage({ damage, className }: DamageProps) {
  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="damage-grid">
        {ROWS.map(({ key, label }) => (
          <div className="damage-item" key={key}>
            <span className="damage-label">{label}</span>
            <GaugeBar value={damage[key]} tone={damageTone(damage[key])} />
          </div>
        ))}
      </div>
    </div>
  );
}
