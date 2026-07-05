namespace F1Telemetry.Host.Logging;

/// <summary>
/// Per-lap ERS/DRS resource-usage aggregate shown in the History Lap Times grid.
/// Persisted on v3 laps at lap completion; recomputed on read for v2 logs.
/// Shape matches what the front-end expects under the lap's <c>perf</c> key.
/// </summary>
public sealed class LapPerfData
{
    public byte PerfPct { get; set; }
    public byte ErsUsagePct { get; set; }
    public byte DrsUsagePct { get; set; }
    public bool DrsZoneBased { get; set; }

    /// <summary>
    /// True when <see cref="DrsUsagePct"/> measures active-aero Straight Mode (format 2026+)
    /// rather than DRS. The metric shape is identical; only the underlying signal and the
    /// zone set differ. Lets the UI label the figure "SM" instead of "DRS".
    /// </summary>
    public bool StraightMode { get; set; }

    /// <summary>
    /// Share of the lap's samples with Overtake (Boost) active — the gap-based attack tool of
    /// the 2026 regs. Informational only (not part of <see cref="PerfPct"/>); null for
    /// pre-2026 sessions where the signal doesn't exist.
    /// </summary>
    public byte? OvertakeUsagePct { get; set; }

    public byte? HarvEfficiencyPct { get; set; }
    public float? HarvCapMJ { get; set; }
    public float? HarvUsedMJ { get; set; }

    /// <summary>Constant weights, emitted for the UI tooltip. Get-only so deserialization skips it.</summary>
    public PerfWeights Weights => PerfWeights.Default;
}

public sealed class PerfWeights
{
    public static readonly PerfWeights Default = new();
    public float Ers => LapPerfCalculator.Wers;
    public float Drs => LapPerfCalculator.Wdrs;
}

/// <summary>
/// Aggregates a lap's 20 Hz samples into a single normalized resource-usage percentage:
/// 100% means max allowed ERS deployment for the lap + DRS used across all configured
/// static DRS zones for this track. DRS is normalized by zone coverage (not whole lap) so
/// non-DRS parts of the lap do not dilute the score.
/// </summary>
public static class LapPerfCalculator
{
    /// <summary>
    /// 4 MJ per-lap MGU-K deployment allowance (2025 regs). Used as the ERS-usage denominator
    /// only when the game ships no per-lap budget (2025 logs, where HarvLimJ == 0). For 2026+
    /// the per-lap harvest limit from the packet is used instead — see <see cref="Compute"/>.
    /// </summary>
    public const float ErsMaxLapJ = 4_000_000f;
    public const float Wers = 0.7f;
    public const float Wdrs = 0.3f;

    /// <summary>
    /// Returns null when samples are unavailable so the client can render an em-dash.
    /// <paramref name="zones"/> are the static DRS (or Straight-Mode, format 2026+) zone
    /// fractions for the track, selected by the caller from the geometry files; pass null or
    /// empty for tracks with no zone data (falls back to whole-lap usage).
    /// When <paramref name="straightMode"/> is true (format 2026+) the "on" signal is the
    /// active-aero Straight Mode (<see cref="LapSample.Aero"/>) rather than DRS
    /// (<see cref="LapSample.Drs"/>); the caller pairs this with the matching zone set.
    /// </summary>
    public static LapPerfData? Compute(
        IReadOnlyList<LapSample>? samples,
        float trackLengthM,
        (float Start, float End)[]? zones,
        bool straightMode = false)
    {
        if (samples == null || samples.Count == 0) return null;

        var hasZones = trackLengthM > 0 && zones != null && zones.Length > 0;
        int drsZoneSamples = 0;
        int drsOnInZone = 0;
        int drsOnTotal = 0;
        int ovtOnTotal = 0;
        float minErsDepLapJ = float.MaxValue;
        float maxErsDepLapJ = 0f;
        // Harvest tracking is opportunistic: 2025 logs have HarvJ/HarvLimJ == 0 because the
        // game didn't expose the cap. We only emit harvest stats when at least one sample
        // had a non-zero cap (format 2026+).
        float maxHarvJ = 0f;
        float maxHarvLimJ = 0f;

        for (int i = 0; i < samples.Count; i++)
        {
            var s = samples[i];
            // "On" signal: active-aero Straight Mode for 2026+, DRS otherwise.
            var on = straightMode ? s.Aero == 1 : s.Drs == 1;
            if (on) drsOnTotal++;
            if (s.Ovt == 1) ovtOnTotal++;
            if (hasZones)
            {
                var dNorm = Math.Clamp(s.D / trackLengthM, 0f, 1f);
                for (int z = 0; z < zones!.Length; z++)
                {
                    var (start, end) = zones[z];
                    if (dNorm >= start && dNorm <= end)
                    {
                        drsZoneSamples++;
                        if (on) drsOnInZone++;
                        break;
                    }
                }
            }

            var dep = s.ErsDepLapJ;
            if (dep < minErsDepLapJ) minErsDepLapJ = dep;
            if (dep > maxErsDepLapJ) maxErsDepLapJ = dep;

            if (s.HarvJ > maxHarvJ) maxHarvJ = s.HarvJ;
            if (s.HarvLimJ > maxHarvLimJ) maxHarvLimJ = s.HarvLimJ;
        }

        // Per-lap electrical budget for normalization. 2026 ships a real per-lap limit
        // (m_ersHarvestedLimitPerLap → HarvLimJ) that varies by track; the game gives no
        // deploy-cap field, so this harvest budget is the closest authoritative denominator.
        // 2025 logs have no such field (0), so fall back to the fixed 4 MJ MGU-K allowance.
        // Deploy can exceed the harvest budget on a battery draw-down lap → clamped to 100%.
        var ersMaxLapJ = maxHarvLimJ > 0f ? maxHarvLimJ : ErsMaxLapJ;
        var ersUsedLapJ = Math.Max(0f, maxErsDepLapJ - minErsDepLapJ);
        var ersUsage = Math.Clamp(ersUsedLapJ / ersMaxLapJ, 0f, 1f);
        var drsUsage = hasZones
            ? (drsZoneSamples > 0 ? (float)drsOnInZone / drsZoneSamples : 0f)
            : (float)drsOnTotal / samples.Count;
        var perfPct = Math.Clamp((ersUsage * Wers + drsUsage * Wdrs) * 100f, 0f, 100f);

        // Harvest efficiency is "how close did this lap get to the cap" — strategically useful
        // (low = recovering more energy than the regs allow burns, i.e. wasted capacity; high
        // close to 100% = pushing the harvest budget). Reported separately so it doesn't
        // muddle the perfPct definition; null when the format didn't supply a cap.
        byte? harvEfficiencyPct = maxHarvLimJ > 0f
            ? (byte)MathF.Round(Math.Clamp(maxHarvJ / maxHarvLimJ, 0f, 1f) * 100f)
            : null;

        return new LapPerfData
        {
            PerfPct = (byte)MathF.Round(perfPct),
            ErsUsagePct = (byte)MathF.Round(ersUsage * 100f),
            DrsUsagePct = (byte)MathF.Round(drsUsage * 100f),
            DrsZoneBased = hasZones,
            StraightMode = straightMode,
            // Overtake exists only under the 2026 regs — null (not 0%) for older sessions
            // so the UI can skip the tooltip line entirely.
            OvertakeUsagePct = straightMode
                ? (byte)MathF.Round((float)ovtOnTotal / samples.Count * 100f)
                : null,
            HarvEfficiencyPct = harvEfficiencyPct,
            HarvCapMJ = maxHarvLimJ > 0f ? MathF.Round(maxHarvLimJ / 1_000_000f, 2) : null,
            HarvUsedMJ = maxHarvLimJ > 0f ? MathF.Round(maxHarvJ / 1_000_000f, 2) : null,
        };
    }
}
