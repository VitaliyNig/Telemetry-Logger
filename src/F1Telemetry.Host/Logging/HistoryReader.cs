using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using F1Telemetry.Host.Serialization;
using F1Telemetry.Protocol;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Deserializes session log files on demand and keeps a small mtime-keyed cache so repeated
/// History-mode fetches (Lap Times → Positions → Telemetry Compare on the same session) don't
/// re-parse 50 MB of JSON each time.
///
/// Singleton; injected via DI. Was static before — moved to instance so we can hold a
/// <see cref="ProtocolRegistry"/> reference and pick format-appropriate lookups when
/// re-deriving display fields (livery colours, etc.) from raw packet snapshots.
/// </summary>
public sealed class HistoryReader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
    };

    private sealed record CachedSession(long Mtime, SessionLogDataV2 Data)
    {
        // Monotonic LRU stamp, bumped on every cache hit. long writes are atomic; an
        // occasionally stale read only risks evicting a slightly-less-recent entry.
        public long LastUsed { get; set; }
    }

    // Parsed sessions are large (tens of MB); without a bound, browsing History pins every
    // session ever opened in the heap for the process lifetime. 8 entries comfortably covers
    // the UI's working set (Lap Times → Positions → Compare flips between 2-3 sessions).
    private const int MaxCachedSessions = 8;
    private static long _useCounter;

    private readonly ConcurrentDictionary<string, CachedSession> _cache = new();
    private readonly ProtocolRegistry _registry;

    public HistoryReader(ProtocolRegistry registry)
    {
        _registry = registry;
    }

    /// <summary>
    /// Returns <paramref name="name"/> when it is a plain leaf name (no separators, not a
    /// relative segment like "." / ".."), otherwise null. Path.GetFileName alone is not
    /// enough: it passes ".." through unchanged, which would climb out of the History root.
    /// </summary>
    public static string? SafeLeafName(string? name)
    {
        if (string.IsNullOrEmpty(name)) return null;
        if (name != Path.GetFileName(name)) return null;
        if (name == "." || name == "..") return null;
        return name;
    }

    /// <summary>Resolves "{folder}/{slug}" to an absolute file path under the configured History root, rejecting traversal.</summary>
    public static string? ResolvePath(string folder, string slug)
    {
        var safeFolder = SafeLeafName(folder);
        var safeSlug = SafeLeafName(slug);
        if (safeFolder == null || safeSlug == null)
            return null;

        var path = Path.Combine(HistoryRoot.Path, safeFolder, safeSlug + ".json");
        return File.Exists(path) ? path : null;
    }

    public SessionLogDataV2? Load(string folder, string slug)
    {
        var path = ResolvePath(folder, slug);
        if (path == null) return null;

        var mtime = File.GetLastWriteTimeUtc(path).Ticks;
        var key = path;

        if (_cache.TryGetValue(key, out var cached) && cached.Mtime == mtime)
        {
            cached.LastUsed = Interlocked.Increment(ref _useCounter);
            return cached.Data;
        }

        using var stream = File.OpenRead(path);
        var data = JsonSerializer.Deserialize<SessionLogDataV2>(stream, JsonOptions);
        if (data?.Meta == null) return null;

        EnrichLiveryColors(data);

        _cache[key] = new CachedSession(mtime, data) { LastUsed = Interlocked.Increment(ref _useCounter) };
        EvictIfOverCap();
        return data;
    }

    /// <summary>
    /// Returns one lap's samples+motion regardless of schema: inline lists for v2 logs,
    /// a targeted sidecar frame read for v3 (see docs/SESSION_LOG_V3.md). Both null when
    /// the lap has no recorded samples or the sidecar frame is missing/corrupt.
    /// </summary>
    public (List<LapSample>? Samples, List<MotionSample>? Motion) LoadLapBuffers(string folder, string slug, DriverLap lap)
    {
        if (lap.Samples != null || lap.Motion != null)
            return (lap.Samples, lap.Motion);
        if (lap.SRef == null)
            return (null, null);

        var path = ResolvePath(folder, slug);
        if (path == null) return (null, null);

        var blob = SampleSidecar.ReadAt(SampleSidecar.PathFor(path), lap.SRef);
        return (blob?.Samples, blob?.Motion);
    }

    /// <summary>
    /// Deep-copies one driver's session data with samples/motion hydrated inline (from the
    /// sidecar for v3 logs), for ghost export. The copy keeps the exported payload in the
    /// v2-compatible inline shape and protects the cached graph from mutation. Serialization
    /// round-trip clone is deliberate: exports are rare and the summaries are small.
    /// </summary>
    public DriverSessionData? LoadDriverWithSamples(string folder, string slug, int carIdx)
    {
        var data = Load(folder, slug);
        if (data?.Drivers == null || !data.Drivers.TryGetValue(carIdx, out var driver))
            return null;

        var clone = JsonSerializer.Deserialize<DriverSessionData>(
            JsonSerializer.SerializeToUtf8Bytes(driver, JsonOptions), JsonOptions);
        if (clone == null) return null;

        foreach (var lap in clone.Laps)
        {
            if (lap.Samples != null || lap.SRef == null) continue;
            var (samples, motion) = LoadLapBuffers(folder, slug, lap);
            lap.Samples = samples;
            lap.Motion = motion;
            lap.SRef = null; // inline payload; refs are meaningless outside this folder
        }
        return clone;
    }

    /// <summary>Drops least-recently-used entries until the cache is back under the cap.</summary>
    private void EvictIfOverCap()
    {
        while (_cache.Count > MaxCachedSessions)
        {
            string? oldestKey = null;
            long oldestUsed = long.MaxValue;
            foreach (var (k, v) in _cache)
            {
                if (v.LastUsed < oldestUsed) { oldestUsed = v.LastUsed; oldestKey = k; }
            }
            if (oldestKey == null || !_cache.TryRemove(oldestKey, out _)) break;
        }
    }

    /// <summary>
    /// Recomputes <see cref="DriverSessionData.LiveryColorHex"/> from the stored Participants
    /// packet snapshot every time a session is loaded. The snapshot is the source of truth;
    /// the stored hex is a denormalized cache that can be stale if (a) the session was saved
    /// before the field existed, or (b) <see cref="ProtocolLookups.LiveryColourSlotOverrides"/>
    /// rules changed since the session was recorded. Falls back to the recorded value only
    /// when the snapshot lacks enough data.
    ///
    /// Slot overrides are pulled from the session's saved <c>m_packetFormat</c>; old logs
    /// (meta.PacketFormat == 0) fall back to the oldest registered plugin via
    /// <see cref="ProtocolRegistry.GetOrFallback"/>.
    /// </summary>
    private void EnrichLiveryColors(SessionLogDataV2 data)
    {
        if (data.Drivers == null || data.Packets == null) return;
        if (!data.Packets.TryGetValue("Participants", out var raw) || raw is not JsonElement el) return;
        if (!el.TryGetProperty("participants", out var parts) || parts.ValueKind != JsonValueKind.Array) return;

        // PacketFormat == 0 means "legacy log saved before the field existed" — pre-2026
        // sessions, so 2025 is the right fallback.
        var packetFormat = data.Meta?.PacketFormat is { } pf and not 0 ? pf : (ushort)2025;
        var plugin = _registry.GetOrFallback(packetFormat);
        var lookups = plugin?.Lookups;

        foreach (var (carIdx, driver) in data.Drivers)
        {
            if (carIdx >= parts.GetArrayLength()) continue;

            var p = parts[carIdx];
            if (!p.TryGetProperty("numColours", out var numColoursEl)) continue;
            var numColours = numColoursEl.GetByte();
            if (numColours == 0) continue;
            if (!p.TryGetProperty("liveryColours", out var coloursEl) || coloursEl.GetArrayLength() == 0) continue;

            if (!p.TryGetProperty("teamId", out var teamIdEl)) continue;
            // teamId widened to uint16 in format 2026; older logs still emit ≤ 255 so UInt16 read works either way.
            var preferred = lookups?.GetLiveryColourSlot(teamIdEl.GetUInt16()) ?? 0;
            var slotIdx = Math.Min(preferred, numColours - 1);

            var c = coloursEl[slotIdx];
            if (!c.TryGetProperty("red", out var r) ||
                !c.TryGetProperty("green", out var g) ||
                !c.TryGetProperty("blue", out var b)) continue;

            driver.LiveryColorHex = $"#{r.GetByte():X2}{g.GetByte():X2}{b.GetByte():X2}";
        }
    }
}
