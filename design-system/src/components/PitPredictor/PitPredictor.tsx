import { Button } from "../Button/Button";
import { StatBox } from "../StatBox/StatBox";

export interface PitPredictorCar {
  carIdx: number;
  pos: number;
  gapToLeaderMs: number;
  name: string;
  isPlayer?: boolean;
}

export interface PitPredictorProps {
  cars: PitPredictorCar[];
  pitTimeSec: number;
  onPitTimeChange: (value: number) => void;
  onSave: () => void;
  saveStatus?: string;
  className?: string;
}

interface RankedCar extends PitPredictorCar {
  effectiveGap: number;
}

/** Mirrors `tpl-pitPredictor` / `updatePitPredictor` — predicted post-pit-stop classification. */
export function PitPredictor({ cars, pitTimeSec, onPitTimeChange, onSave, saveStatus, className }: PitPredictorProps) {
  const sorted = [...cars].sort((a, b) => a.pos - b.pos);
  const playerEntry = sorted.find((r) => r.isPlayer);

  let predictedPos: number | null = null;
  let aheadName = "--";
  let aheadGap = "--";
  let behindName = "--";
  let behindGap = "--";

  if (playerEntry) {
    const pitTimeMs = pitTimeSec * 1000;
    const playerGapAfterPit = playerEntry.gapToLeaderMs + pitTimeMs;

    predictedPos = 1;
    for (const r of sorted) {
      if (r.isPlayer) continue;
      if (r.gapToLeaderMs < playerGapAfterPit) predictedPos++;
    }

    const positionsAfterPit: RankedCar[] = sorted
      .filter((r) => !r.isPlayer)
      .map((r) => ({ ...r, effectiveGap: r.gapToLeaderMs }))
      .concat([{ ...playerEntry, effectiveGap: playerGapAfterPit }])
      .sort((a, b) => a.effectiveGap - b.effectiveGap);

    const playerIdx = positionsAfterPit.findIndex((r) => r.isPlayer);

    if (playerIdx > 0) {
      const ahead = positionsAfterPit[playerIdx - 1];
      aheadName = ahead.name;
      aheadGap = `+${((playerGapAfterPit - ahead.effectiveGap) / 1000).toFixed(1)}s`;
    } else {
      aheadName = "Leader";
    }

    if (playerIdx < positionsAfterPit.length - 1) {
      const behind = positionsAfterPit[playerIdx + 1];
      behindName = behind.name;
      behindGap = `-${((behind.effectiveGap - playerGapAfterPit) / 1000).toFixed(1)}s`;
    } else {
      behindName = "No car behind";
    }
  }

  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="pitstop-config">
        <span className="stat-label">Pit Time (s)</span>
        <input
          type="number"
          className="pit-time-input"
          step={0.1}
          min={15}
          max={40}
          value={pitTimeSec}
          onChange={(e) => onPitTimeChange(parseFloat(e.target.value))}
        />
        <Button size="small" variant="primary" onClick={onSave}>Save</Button>
        <span className="pit-save-status">{saveStatus ?? ""}</span>
      </div>
      <div className="pitstop-prediction">
        <div className="pit-result">
          <StatBox label="Predicted Position" value={predictedPos ?? "--"} big />
        </div>
        <div className="pit-gaps">
          <div className="pit-gap-item">
            <span className="pit-gap-label">Car Ahead</span>
            <span className="pit-gap-driver">{aheadName}</span>
            <span className="pit-gap-value">{aheadGap}</span>
          </div>
          <div className="pit-gap-item">
            <span className="pit-gap-label">Car Behind</span>
            <span className="pit-gap-driver">{behindName}</span>
            <span className="pit-gap-value">{behindGap}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
