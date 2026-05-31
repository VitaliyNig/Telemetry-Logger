using System.Collections.Concurrent;
using System.IO;
using System.Text.Json;
using F1Telemetry.Host.Serialization;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Deserializes session log files on demand and keeps a small mtime-keyed cache so repeated
/// History-mode fetches (Lap Times → Positions → Telemetry Compare on the same session) don't
/// re-parse 50 MB of JSON each time.
/// </summary>
public static class HistoryReader
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
    };

    private sealed record CachedSession(long Mtime, SessionLogDataV2 Data);

    private static readonly ConcurrentDictionary<string, CachedSession> _cache = new();

    /// <summary>Resolves "{folder}/{slug}" to an absolute file path under the configured History root, rejecting traversal.</summary>
    public static string? ResolvePath(string folder, string slug)
    {
        var safeFolder = Path.GetFileName(folder);
        var safeSlug = Path.GetFileName(slug);
        if (string.IsNullOrEmpty(safeFolder) || string.IsNullOrEmpty(safeSlug))
            return null;

        var path = Path.Combine(HistoryRoot.Path, safeFolder, safeSlug + ".json");
        return File.Exists(path) ? path : null;
    }

    public static SessionLogDataV2? Load(string folder, string slug)
    {
        var path = ResolvePath(folder, slug);
        if (path == null) return null;

        var mtime = File.GetLastWriteTimeUtc(path).Ticks;
        var key = path;

        if (_cache.TryGetValue(key, out var cached) && cached.Mtime == mtime)
            return cached.Data;

        using var stream = File.OpenRead(path);
        var data = JsonSerializer.Deserialize<SessionLogDataV2>(stream, JsonOptions);
        if (data?.Meta == null) return null;

        EnrichLiveryColors(data);

        _cache[key] = new CachedSession(mtime, data);
        return data;
    }

    /// <summary>
    /// Recomputes <see cref="DriverSessionData.LiveryColorHex"/> from the stored Participants
    /// packet snapshot every time a session is loaded. The snapshot is the source of truth;
    /// the stored hex is a denormalized cache that can be stale if (a) the session was saved
    /// before the field existed, or (b) <see cref="LiveryColourSelector"/> rules changed since
    /// the session was recorded. Falls back to the recorded value only when the snapshot lacks
    /// enough data.
    /// </summary>
    private static void EnrichLiveryColors(SessionLogDataV2 data)
    {
        if (data.Drivers == null || data.Packets == null) return;
        if (!data.Packets.TryGetValue("Participants", out var raw) || raw is not JsonElement el) return;
        if (!el.TryGetProperty("participants", out var parts) || parts.ValueKind != JsonValueKind.Array) return;

        var gameYear = data.Meta?.GameYear ?? 0;

        foreach (var (carIdx, driver) in data.Drivers)
        {
            if (carIdx >= parts.GetArrayLength()) continue;

            var p = parts[carIdx];
            if (!p.TryGetProperty("numColours", out var numColoursEl)) continue;
            var numColours = numColoursEl.GetByte();
            if (numColours == 0) continue;
            if (!p.TryGetProperty("liveryColours", out var coloursEl) || coloursEl.GetArrayLength() == 0) continue;

            if (!p.TryGetProperty("teamId", out var teamIdEl)) continue;
            var slotIdx = Math.Min(LiveryColourSelector.GetIndex(gameYear, teamIdEl.GetByte()), numColours - 1);

            var c = coloursEl[slotIdx];
            if (!c.TryGetProperty("red", out var r) ||
                !c.TryGetProperty("green", out var g) ||
                !c.TryGetProperty("blue", out var b)) continue;

            driver.LiveryColorHex = $"#{r.GetByte():X2}{g.GetByte():X2}{b.GetByte():X2}";
        }
    }
}
