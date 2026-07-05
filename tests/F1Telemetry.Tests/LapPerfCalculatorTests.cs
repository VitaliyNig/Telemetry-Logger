using F1Telemetry.Host.Logging;
using Xunit;

namespace F1Telemetry.Tests;

public sealed class LapPerfCalculatorTests
{
    private static readonly (float Start, float End)[]? NoZones = null;

    [Fact]
    public void Compute_ReturnsNull_WithoutSamples()
    {
        Assert.Null(LapPerfCalculator.Compute(null, 5000f, NoZones));
        Assert.Null(LapPerfCalculator.Compute(new List<LapSample>(), 5000f, NoZones));
    }

    [Fact]
    public void FullErsAndFullDrsInZones_Scores100()
    {
        // One DRS zone covering the first half of the lap; DRS open on every in-zone sample.
        var zones = new[] { (0f, 0.5f) };
        var samples = new List<LapSample>();
        for (int i = 0; i < 100; i++)
        {
            var d = i * 50f; // 0..4950 over a 5000 m lap
            samples.Add(new LapSample
            {
                D = d,
                Drs = (byte)(d / 5000f <= 0.5f ? 1 : 0),
                ErsDepLapJ = i * (LapPerfCalculator.ErsMaxLapJ / 99f), // full 4 MJ deployed
            });
        }

        var perf = LapPerfCalculator.Compute(samples, 5000f, zones)!;
        Assert.True(perf.DrsZoneBased);
        Assert.Equal(100, perf.ErsUsagePct);
        Assert.Equal(100, perf.DrsUsagePct);
        Assert.Equal(100, perf.PerfPct);
    }

    [Fact]
    public void StraightMode_UsesAeroSignalNotDrs()
    {
        // 2026 track: one Straight-Mode zone over the first half. Aero = Straight (1) in-zone,
        // while m_drs stays 0 (DRS is retired in 2026) — the metric must follow Aero.
        var zones = new[] { (0f, 0.5f) };
        var samples = new List<LapSample>();
        for (int i = 0; i < 100; i++)
        {
            var d = i * 50f;
            samples.Add(new LapSample
            {
                D = d,
                Drs = 0,
                Aero = (byte)(d / 5000f <= 0.5f ? 1 : 0),
            });
        }

        var sm = LapPerfCalculator.Compute(samples, 5000f, zones, straightMode: true)!;
        Assert.True(sm.StraightMode);
        Assert.True(sm.DrsZoneBased);
        Assert.Equal(100, sm.DrsUsagePct);

        // Same samples read as DRS (2025 rules) see no DRS at all.
        var drs = LapPerfCalculator.Compute(samples, 5000f, zones, straightMode: false)!;
        Assert.False(drs.StraightMode);
        Assert.Equal(0, drs.DrsUsagePct);
    }

    [Fact]
    public void WithoutZones_DrsFallsBackToWholeLapShare()
    {
        var samples = new List<LapSample>();
        for (int i = 0; i < 100; i++)
            samples.Add(new LapSample { D = i * 50f, Drs = (byte)(i < 25 ? 1 : 0) });

        var perf = LapPerfCalculator.Compute(samples, 5000f, NoZones)!;
        Assert.False(perf.DrsZoneBased);
        Assert.Equal(25, perf.DrsUsagePct);
        Assert.Equal(0, perf.ErsUsagePct);
    }

    [Fact]
    public void OvertakeUsage_EmittedOnlyForStraightModeSessions()
    {
        // 25 of 100 samples with Overtake active → 25% for a 2026 lap, null for 2025.
        var samples = new List<LapSample>();
        for (int i = 0; i < 100; i++)
            samples.Add(new LapSample { D = i * 50f, Ovt = (byte)(i < 25 ? 1 : 0) });

        var sm = LapPerfCalculator.Compute(samples, 5000f, NoZones, straightMode: true)!;
        Assert.Equal((byte)25, sm.OvertakeUsagePct);

        var legacy = LapPerfCalculator.Compute(samples, 5000f, NoZones, straightMode: false)!;
        Assert.Null(legacy.OvertakeUsagePct);
    }

    [Fact]
    public void ErsUsage_NormalizedByPerLapHarvestBudget_When2026()
    {
        // 2026 lap: deploy 4 MJ over the lap against an 8 MJ per-lap budget → 50% usage.
        // The same 4 MJ against the fixed 4 MJ 2025 allowance would read 100%.
        var samples = new List<LapSample>();
        for (int i = 0; i < 100; i++)
        {
            samples.Add(new LapSample
            {
                D = i * 50f,
                ErsDepLapJ = i * (4_000_000f / 99f), // ramps 0 → 4 MJ deployed this lap
                HarvLimJ = 8_000_000f,               // per-lap budget shipped in 2026
            });
        }

        var perf = LapPerfCalculator.Compute(samples, 5000f, NoZones)!;
        Assert.Equal(50, perf.ErsUsagePct);
    }

    [Fact]
    public void HarvestStats_OnlyEmittedWhenCapPresent()
    {
        var without = LapPerfCalculator.Compute(
            new List<LapSample> { new() { HarvJ = 1_000_000f, HarvLimJ = 0f } }, 5000f, NoZones)!;
        Assert.Null(without.HarvEfficiencyPct);
        Assert.Null(without.HarvCapMJ);

        var with = LapPerfCalculator.Compute(
            new List<LapSample> { new() { HarvJ = 1_500_000f, HarvLimJ = 2_000_000f } }, 5000f, NoZones)!;
        Assert.Equal((byte)75, with.HarvEfficiencyPct);
        Assert.Equal(2f, with.HarvCapMJ);
        Assert.Equal(1.5f, with.HarvUsedMJ);
    }
}
