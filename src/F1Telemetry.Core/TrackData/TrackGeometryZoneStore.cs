using System.Text.Json;
using System.Text.Json.Serialization;

namespace F1Telemetry.TrackData;

/// <summary>
/// Reads authoritative DRS and Straight-Mode (active-aero / "X-mode") zones from the static
/// per-track geometry files under <c>wwwroot/data/track-geometry/{trackId}.json</c> — the same
/// files the 3D track map renders. Replaces the old runtime lap-capture: the game now ships
/// precise zone fractions, so there is nothing to derive at runtime.
///
/// Which set applies depends on the game version: DRS era (format ≤ 2025) uses
/// <c>drsZones</c>, the 2026 active-aero era uses <c>xModeZones</c> (Straight Mode).
/// Loads are cached per track; a missing or malformed file yields an empty array, which
/// callers treat as "no zones" (whole-lap fallback for the Perf metric).
/// </summary>
public sealed class TrackGeometryZoneStore
{
    private static readonly (float Start, float End)[] Empty = [];

    private readonly string _dir;
    private readonly object _lock = new();
    private readonly Dictionary<int, TrackZones> _cache = new();

    public TrackGeometryZoneStore(string trackGeometryDir)
    {
        _dir = trackGeometryDir;
    }

    /// <summary>
    /// True for packet formats where DRS was replaced by active-aero Straight Mode (2026+),
    /// so the Perf metric and zone lookups should use <c>xModeZones</c> rather than
    /// <c>drsZones</c>. A 0 format means "unknown/legacy" and stays on DRS.
    /// </summary>
    public static bool UsesStraightMode(ushort packetFormat) => packetFormat >= 2026;

    /// <summary>
    /// Returns the zone fractions for <paramref name="trackId"/>. When
    /// <paramref name="straightMode"/> is true (format 2026+), the Straight-Mode / active-aero
    /// zones are returned; otherwise the DRS zones. Empty when the track has no geometry file.
    /// </summary>
    public (float Start, float End)[] GetZones(int trackId, bool straightMode)
    {
        var z = Load(trackId);
        return straightMode ? z.XMode : z.Drs;
    }

    private TrackZones Load(int trackId)
    {
        lock (_lock)
        {
            if (_cache.TryGetValue(trackId, out var cached))
                return cached;

            var zones = ReadFile(trackId);
            _cache[trackId] = zones;
            return zones;
        }
    }

    private TrackZones ReadFile(int trackId)
    {
        var path = Path.Combine(_dir, $"{trackId}.json");
        if (!File.Exists(path))
            return TrackZones.None;

        try
        {
            using var stream = File.OpenRead(path);
            var geom = JsonSerializer.Deserialize<GeometryZones>(stream);
            if (geom == null)
                return TrackZones.None;
            return new TrackZones(Parse(geom.DrsZones), Parse(geom.XModeZones));
        }
        catch
        {
            return TrackZones.None;
        }
    }

    private static (float Start, float End)[] Parse(List<List<float>>? raw)
    {
        if (raw == null || raw.Count == 0) return Empty;
        var list = new List<(float Start, float End)>(raw.Count);
        foreach (var pair in raw)
        {
            if (pair == null || pair.Count < 2) continue;
            var start = Math.Clamp(pair[0], 0f, 1f);
            var end = Math.Clamp(pair[1], 0f, 1f);
            if (end <= start) continue;
            list.Add((start, end));
        }
        return list.Count == 0 ? Empty : list.ToArray();
    }

    private readonly record struct TrackZones(
        (float Start, float End)[] Drs,
        (float Start, float End)[] XMode)
    {
        public static readonly TrackZones None = new(Empty, Empty);
    }

    private sealed class GeometryZones
    {
        [JsonPropertyName("drsZones")]
        public List<List<float>>? DrsZones { get; set; }

        [JsonPropertyName("xModeZones")]
        public List<List<float>>? XModeZones { get; set; }
    }
}
