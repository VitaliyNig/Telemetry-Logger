using System.IO;
using System.Text.Json;
using F1Telemetry.Host.Logging;
using F1Telemetry.Host.Serialization;
using F1Telemetry.Protocol;
using Xunit;

namespace F1Telemetry.Tests;

/// <summary>
/// End-to-end read path for split-storage (v3) session logs: main JSON with srefs +
/// ".samples" sidecar, loaded through HistoryReader. Also guards the v2 inline path.
/// </summary>
[Collection("HistoryRoot")]
public sealed class HistoryReaderV3Tests : IDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
    };

    private readonly string _root;
    private readonly string _weekendDir;
    private readonly HistoryReader _reader;

    public HistoryReaderV3Tests()
    {
        _root = Path.Combine(Path.GetTempPath(), "f1t-v3-" + Guid.NewGuid().ToString("N"));
        _weekendDir = Path.Combine(_root, "weekend");
        Directory.CreateDirectory(_weekendDir);
        HistoryRoot.OverrideForSession(_root);
        _reader = new HistoryReader(new ProtocolRegistry(Array.Empty<IProtocolPlugin>()));
    }

    public void Dispose()
    {
        HistoryRoot.OverrideForSession(null);
        try { Directory.Delete(_root, recursive: true); } catch { }
    }

    private static List<LapSample> MakeSamples(int count) =>
        Enumerable.Range(0, count).Select(i => new LapSample { T = i * 0.05f, D = i * 10f, Spd = 250 }).ToList();

    private void WriteSession(string slug, SessionLogDataV2 data) =>
        File.WriteAllText(Path.Combine(_weekendDir, slug + ".json"),
            JsonSerializer.Serialize(data, JsonOptions));

    private SessionLogDataV2 MakeSession(int schemaVersion, DriverLap lap) => new()
    {
        Meta = new SessionLogMetaV2 { SchemaVersion = schemaVersion, TrackId = 11, TrackLengthM = 5000f },
        Drivers = new Dictionary<int, DriverSessionData>
        {
            [4] = new() { CarIdx = 4, Name = "Test", Laps = { lap } },
        },
    };

    [Fact]
    public void V3_LoadLapBuffers_ReadsFromSidecar()
    {
        var sidecar = Path.Combine(_weekendDir, "race.samples");
        var sref = SampleSidecar.Append(sidecar, new SampleSidecar.LapBlob
        {
            CarIdx = 4,
            LapNum = 1,
            Samples = MakeSamples(30),
            Motion = new List<MotionSample> { new() { X = 5f, Z = -5f } },
        });
        WriteSession("race", MakeSession(3, new DriverLap { LapNum = 1, LapTimeMs = 90_000, SRef = sref }));

        var data = _reader.Load("weekend", "race");
        Assert.NotNull(data);
        var lap = data!.Drivers![4].Laps[0];
        Assert.Null(lap.Samples); // main file carries no inline samples

        var (samples, motion) = _reader.LoadLapBuffers("weekend", "race", lap);
        Assert.Equal(30, samples!.Count);
        Assert.Single(motion!);
        Assert.Equal(250, samples[0].Spd);
    }

    [Fact]
    public void V2_LoadLapBuffers_ReturnsInlineLists()
    {
        WriteSession("q1", MakeSession(0, new DriverLap { LapNum = 1, Samples = MakeSamples(7) }));

        var lap = _reader.Load("weekend", "q1")!.Drivers![4].Laps[0];
        var (samples, _) = _reader.LoadLapBuffers("weekend", "q1", lap);
        Assert.Equal(7, samples!.Count);
    }

    [Fact]
    public void V3_MissingSidecar_YieldsNullBuffers_NotAnError()
    {
        WriteSession("q2", MakeSession(3, new DriverLap { LapNum = 1, SRef = new SampleRef { O = 0, L = 100 } }));

        var lap = _reader.Load("weekend", "q2")!.Drivers![4].Laps[0];
        var (samples, motion) = _reader.LoadLapBuffers("weekend", "q2", lap);
        Assert.Null(samples);
        Assert.Null(motion);
    }

    [Fact]
    public void LoadDriverWithSamples_HydratesInline_WithoutMutatingCache()
    {
        var sidecar = Path.Combine(_weekendDir, "race2.samples");
        var sref = SampleSidecar.Append(sidecar, new SampleSidecar.LapBlob
        {
            CarIdx = 4,
            LapNum = 1,
            Samples = MakeSamples(12),
        });
        WriteSession("race2", MakeSession(3, new DriverLap { LapNum = 1, SRef = sref }));

        var hydrated = _reader.LoadDriverWithSamples("weekend", "race2", 4);
        Assert.NotNull(hydrated);
        Assert.Equal(12, hydrated!.Laps[0].Samples!.Count);
        Assert.Null(hydrated.Laps[0].SRef); // refs are meaningless in the exported payload

        // The cached graph must stay lean: samples were hydrated only on the clone.
        var cachedLap = _reader.Load("weekend", "race2")!.Drivers![4].Laps[0];
        Assert.Null(cachedLap.Samples);
        Assert.NotNull(cachedLap.SRef);
    }
}
