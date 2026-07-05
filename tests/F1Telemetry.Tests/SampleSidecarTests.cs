using System.IO;
using F1Telemetry.Host.Logging;
using Xunit;

namespace F1Telemetry.Tests;

public sealed class SampleSidecarTests : IDisposable
{
    private readonly string _dir;
    private readonly string _sidecar;

    public SampleSidecarTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "f1t-sidecar-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _sidecar = Path.Combine(_dir, "race.samples");
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { }
    }

    private static SampleSidecar.LapBlob MakeBlob(int carIdx, byte lapNum, int sampleCount)
    {
        var samples = new List<LapSample>();
        for (int i = 0; i < sampleCount; i++)
            samples.Add(new LapSample { T = i * 0.05f, D = i * 5f, Spd = (ushort)(200 + i), Thr = 100, Drs = (byte)(i % 2) });
        return new SampleSidecar.LapBlob
        {
            CarIdx = carIdx,
            LapNum = lapNum,
            Samples = samples,
            Motion = new List<MotionSample> { new() { T = 0f, D = 0f, X = 1.5f, Y = 12f, Z = -3.25f } },
        };
    }

    [Fact]
    public void AppendThenReadAt_RoundTripsMultipleFrames()
    {
        var refs = new List<(SampleRef Ref, int CarIdx, byte LapNum, int Count)>();
        foreach (var (car, lap, n) in new[] { (0, (byte)1, 40), (7, (byte)1, 55), (0, (byte)2, 3) })
            refs.Add((SampleSidecar.Append(_sidecar, MakeBlob(car, lap, n)), car, lap, n));

        foreach (var (sref, car, lap, n) in refs)
        {
            var blob = SampleSidecar.ReadAt(_sidecar, sref);
            Assert.NotNull(blob);
            Assert.Equal(car, blob!.CarIdx);
            Assert.Equal(lap, blob.LapNum);
            Assert.Equal(n, blob.Samples!.Count);
            Assert.Equal(12f, blob.Motion![0].Y);
        }
    }

    [Fact]
    public void ReadAt_ReturnsNull_ForBogusRefs()
    {
        var sref = SampleSidecar.Append(_sidecar, MakeBlob(0, 1, 10));

        Assert.Null(SampleSidecar.ReadAt(_sidecar, new SampleRef { O = sref.O + 1, L = sref.L })); // not a frame start
        Assert.Null(SampleSidecar.ReadAt(_sidecar, new SampleRef { O = 0, L = sref.L + 999 }));     // runs past EOF
        Assert.Null(SampleSidecar.ReadAt(Path.Combine(_dir, "missing.samples"), sref));             // no file
    }

    [Fact]
    public void Scan_EnumeratesAllFrames_AndStopsAtTruncation()
    {
        SampleSidecar.Append(_sidecar, MakeBlob(0, 1, 5));
        SampleSidecar.Append(_sidecar, MakeBlob(1, 1, 5));
        var full = SampleSidecar.Scan(_sidecar).ToList();
        Assert.Equal(2, full.Count);
        Assert.Equal(1, full[1].Blob.CarIdx);

        // Simulate a crash mid-append: append a third frame, then chop its tail off.
        SampleSidecar.Append(_sidecar, MakeBlob(2, 1, 50));
        using (var fs = new FileStream(_sidecar, FileMode.Open, FileAccess.ReadWrite))
            fs.SetLength(fs.Length - 10);

        var truncated = SampleSidecar.Scan(_sidecar).ToList();
        Assert.Equal(2, truncated.Count); // first two intact, torn frame skipped silently
    }

    [Fact]
    public void FlashbackRewrite_NewFrameWins_OldFrameStillReadable()
    {
        var first = SampleSidecar.Append(_sidecar, MakeBlob(3, 5, 10));
        var second = SampleSidecar.Append(_sidecar, MakeBlob(3, 5, 20)); // same lap re-completed

        Assert.Equal(20, SampleSidecar.ReadAt(_sidecar, second)!.Samples!.Count);
        Assert.Equal(10, SampleSidecar.ReadAt(_sidecar, first)!.Samples!.Count); // orphan, but intact
    }
}
