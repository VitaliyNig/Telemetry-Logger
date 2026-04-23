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

    /// <summary>Resolves "{folder}/{slug}" to an absolute file path under Logs/, rejecting traversal.</summary>
    public static string? ResolvePath(string folder, string slug)
    {
        var safeFolder = Path.GetFileName(folder);
        var safeSlug = Path.GetFileName(slug);
        if (string.IsNullOrEmpty(safeFolder) || string.IsNullOrEmpty(safeSlug))
            return null;

        var path = Path.Combine(AppContext.BaseDirectory, "Logs", safeFolder, safeSlug + ".json");
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
        if (data == null) return null;

        // Only schema-v2 logs carry per-lap samples. Older logs are handled elsewhere (hidden
        // from /api/sessions); this is belt-and-braces for direct detail-endpoint access.
        if (data.Meta is null || data.Meta.SchemaVersion < 2) return null;

        _cache[key] = new CachedSession(mtime, data);
        return data;
    }
}
