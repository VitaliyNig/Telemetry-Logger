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

    private sealed record CachedSession(long Mtime, SessionLogDataV2 Data);

    private readonly ConcurrentDictionary<string, CachedSession> _cache = new();
    private readonly ProtocolRegistry _registry;

    public HistoryReader(ProtocolRegistry registry)
    {
        _registry = registry;
    }

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

    public SessionLogDataV2? Load(string folder, string slug)
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
