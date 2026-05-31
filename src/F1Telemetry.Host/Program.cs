using System.IO;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Media;
using System.Xml.Linq;
using Microsoft.Extensions.Options;
using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Host.Logging;
using F1Telemetry.Host.Serialization;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.TrackData;
using F1Telemetry.Tray;
using F1Telemetry.Udp;
using Microsoft.AspNetCore.ResponseCompression;

namespace F1Telemetry;

static class Program
{
    // /api/sessions cache — invalidated automatically when any Logs/ subdir changes mtime.
    private static readonly object _sessionsCacheLock = new();
    private static long? _sessionsCacheVersion;
    private static object? _sessionsCacheValue;

    // /api/pit-times cache — hydrated on first access, kept in sync with the file on PUT.
    private static readonly SemaphoreSlim _pitTimesLock = new(1, 1);
    private static Dictionary<string, JsonElement>? _pitTimesCache;

    private static async Task<Dictionary<string, JsonElement>> LoadPitTimesAsync(string path)
    {
        if (_pitTimesCache != null) return _pitTimesCache;
        await _pitTimesLock.WaitAsync();
        try
        {
            if (_pitTimesCache != null) return _pitTimesCache;
            if (!File.Exists(path))
            {
                _pitTimesCache = new Dictionary<string, JsonElement>();
                return _pitTimesCache;
            }
            var json = await File.ReadAllTextAsync(path);
            _pitTimesCache = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)
                             ?? new Dictionary<string, JsonElement>();
            return _pitTimesCache;
        }
        finally { _pitTimesLock.Release(); }
    }

    private static bool TryGetAttributes(string path, out FileAttributes attrs)
    {
        try { attrs = File.GetAttributes(path); return true; }
        catch { attrs = default; return false; }
    }

    // Lightweight view of session-log meta used by /api/sessions when listing weekend cards.
    // TrackId is nullable because synthesized headers (old logs without meta) can't recover it.
    private readonly record struct SessionMetaHeader(
        int? TrackId, string TrackName, string SessionTypeName, string SavedAt,
        byte? GameYear, byte? Formula, string? FormulaName);

    /// <summary>
    /// Reads only the top-level "meta" object from a session-log JSON file. Tries a fast path
    /// (locate meta's byte range in the first 256 KB, JsonDocument.Parse just that slice) and
    /// falls back to a full-stream parse for files where meta isn't where we expect it (e.g.
    /// historical schemas, hand-edited files). Returns false on missing/invalid meta.
    /// </summary>
    private static bool TryReadSessionMeta(string file, out SessionMetaHeader header)
    {
        header = default;
        try
        {
            using var stream = File.OpenRead(file);
            if (stream.Length == 0) return false;

            // Fast path: read up to 256 KB, locate meta's byte range, parse just that slice.
            const int MaxHead = 256 * 1024;
            var len = (int)Math.Min(stream.Length, MaxHead);
            var buffer = new byte[len];
            int total = 0;
            while (total < len)
            {
                int n = stream.Read(buffer, total, len - total);
                if (n == 0) break;
                total += n;
            }
            bool isFinal = total == stream.Length;

            if (TryExtractMetaSlice(buffer, total, isFinal, out var metaStart, out var metaEnd)
                && TryParseMetaSlice(buffer, metaStart, metaEnd - metaStart, out header))
            {
                return true;
            }

            // Fallback: re-read from the top with the original full-document parser. Slower but
            // tolerates any meta layout (e.g. meta is not the first property, file is malformed
            // past 256 KB but meta itself parses cleanly via the document API).
            stream.Position = 0;
            using var doc = JsonDocument.Parse(stream);
            return TryReadHeaderFromElement(doc.RootElement, out header);
        }
        catch { return false; }
    }

    private static bool TryExtractMetaSlice(byte[] buffer, int total, bool isFinal,
        out int metaStart, out int metaEnd)
    {
        metaStart = -1; metaEnd = -1;
        try
        {
            var reader = new Utf8JsonReader(buffer.AsSpan(0, total),
                isFinalBlock: isFinal, state: default);
            if (!reader.Read() || reader.TokenType != JsonTokenType.StartObject) return false;

            while (reader.Read())
            {
                if (reader.TokenType == JsonTokenType.EndObject) return false;
                if (reader.TokenType != JsonTokenType.PropertyName) return false;

                bool isMeta = reader.ValueTextEquals("meta");
                if (!reader.Read()) return false;

                if (isMeta)
                {
                    if (reader.TokenType != JsonTokenType.StartObject) return false;
                    int start = (int)reader.TokenStartIndex;
                    if (!reader.TrySkip()) return false;
                    metaStart = start;
                    metaEnd = (int)reader.BytesConsumed;
                    return true;
                }

                if (reader.TokenType == JsonTokenType.StartObject ||
                    reader.TokenType == JsonTokenType.StartArray)
                {
                    if (!reader.TrySkip()) return false;
                }
            }
            return false;
        }
        catch { return false; }
    }

    private static bool TryParseMetaSlice(byte[] buffer, int offset, int length, out SessionMetaHeader header)
    {
        header = default;
        if (length <= 0) return false;
        try
        {
            // JsonDocument.Parse needs an owned buffer slice, so we copy. The slice is ~kilobytes.
            var slice = new byte[length];
            Buffer.BlockCopy(buffer, offset, slice, 0, length);
            using var doc = JsonDocument.Parse(slice);
            return TryReadHeaderFromMeta(doc.RootElement, out header);
        }
        catch { return false; }
    }

    private static bool TryReadHeaderFromElement(JsonElement root, out SessionMetaHeader header)
    {
        header = default;
        if (root.ValueKind != JsonValueKind.Object) return false;
        if (!root.TryGetProperty("meta", out var meta) || meta.ValueKind != JsonValueKind.Object)
            return false;
        return TryReadHeaderFromMeta(meta, out header);
    }

    private static bool TryReadHeaderFromMeta(JsonElement meta, out SessionMetaHeader header)
    {
        header = default;
        if (meta.ValueKind != JsonValueKind.Object) return false;
        if (!meta.TryGetProperty("trackId", out var tidEl) || tidEl.ValueKind != JsonValueKind.Number) return false;
        if (!meta.TryGetProperty("trackName", out var tnEl) || tnEl.ValueKind != JsonValueKind.String) return false;
        if (!meta.TryGetProperty("sessionTypeName", out var stEl) || stEl.ValueKind != JsonValueKind.String) return false;
        if (!meta.TryGetProperty("savedAt", out var saEl) || saEl.ValueKind != JsonValueKind.String) return false;

        byte? gameYear = meta.TryGetProperty("gameYear", out var gy) && gy.ValueKind == JsonValueKind.Number
            ? gy.GetByte() : (byte?)null;
        byte? formula = meta.TryGetProperty("formula", out var fEl) && fEl.ValueKind == JsonValueKind.Number
            ? fEl.GetByte() : (byte?)null;
        string? formulaName = meta.TryGetProperty("formulaName", out var fnEl) && fnEl.ValueKind == JsonValueKind.String
            ? fnEl.GetString() : null;

        header = new SessionMetaHeader(
            tidEl.GetInt32(),
            tnEl.GetString() ?? "",
            stEl.GetString() ?? "",
            saEl.GetString() ?? "",
            gameYear, formula, formulaName);
        return true;
    }

    // Folder format produced by SessionLogger: "F1{year}_{trackSafeName}_{yyyy-MM-dd}_{HH-mm}".
    // SafeName may itself contain underscores (replacing invalid path chars), so the suffix
    // anchors do the heavy lifting.
    private static readonly Regex WeekendFolderRx = new(
        @"^F1(\d+)_(.+)_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})$",
        RegexOptions.Compiled);

    /// <summary>
    /// Build a minimal header from the folder + filename + file mtime when the JSON file has
    /// no embedded meta (very old session logs from before the schema-v2 meta block was added).
    /// trackId stays 0 → no flag is rendered on the card, which is the intended graceful
    /// degradation.
    /// </summary>
    private static bool TrySynthesizeHeaderFromPath(string file, string dir, out SessionMetaHeader header)
    {
        header = default;
        try
        {
            var folderName = Path.GetFileName(dir) ?? "";
            var slug = Path.GetFileNameWithoutExtension(file) ?? "";

            byte? gameYear = null;
            string trackName = folderName;
            string savedAt;

            var match = WeekendFolderRx.Match(folderName);
            if (match.Success)
            {
                if (byte.TryParse(match.Groups[1].Value, out var y)) gameYear = y;
                trackName = match.Groups[2].Value.Replace('_', ' ');
                var datePart = match.Groups[3].Value;
                var timePart = match.Groups[4].Value.Replace('-', ':');
                if (DateTimeOffset.TryParse($"{datePart}T{timePart}", out var folderTs))
                    savedAt = folderTs.ToString("o");
                else
                    savedAt = File.GetLastWriteTime(file).ToString("o");
            }
            else
            {
                savedAt = File.GetLastWriteTime(file).ToString("o");
            }

            var sessionTypeName = F125SessionTypes.GetNameBySlug(slug)
                ?? slug.Replace('_', ' ');

            header = new SessionMetaHeader(
                TrackId: null,
                TrackName: trackName,
                SessionTypeName: sessionTypeName,
                SavedAt: savedAt,
                GameYear: gameYear,
                Formula: null,
                FormulaName: null);
            return true;
        }
        catch { return false; }
    }

    /// <summary>
    /// Aggregates a lap's 20 Hz samples into a single normalized resource-usage percentage:
    /// 100% means max allowed ERS deployment for the lap + DRS used across all configured
    /// static DRS zones for this track. DRS is normalized by zone coverage (not whole lap) so
    /// non-DRS parts of the lap do not dilute the score.
    /// Returns null when samples are unavailable so the client can render an em-dash.
    /// </summary>
    private static object? ComputeLapPerf(List<LapSample>? samples, int trackId, float trackLengthM, DrsZoneStore drsStore)
    {
        if (samples == null || samples.Count == 0) return null;
        const float ErsMaxLapJ = 4_000_000f; // 4 MJ capacity baseline for normalization.
        const float Wers = 0.7f;
        const float Wdrs = 0.3f;

        var drsZonesByTrack = drsStore.Load();
        (float Start, float End)[]? zones = null;
        var hasZones = trackLengthM > 0 &&
            drsZonesByTrack.TryGetValue(trackId, out zones) &&
            zones.Length > 0;
        int drsZoneSamples = 0;
        int drsOnInZone = 0;
        float minErsDepLapJ = float.MaxValue;
        float maxErsDepLapJ = 0f;

        for (int i = 0; i < samples.Count; i++)
        {
            var s = samples[i];
            if (hasZones)
            {
                var dNorm = Math.Clamp(s.D / trackLengthM, 0f, 1f);
                for (int z = 0; z < zones!.Length; z++)
                {
                    var (start, end) = zones[z];
                    if (dNorm >= start && dNorm <= end)
                    {
                        drsZoneSamples++;
                        if (s.Drs == 1) drsOnInZone++;
                        break;
                    }
                }
            }

            var dep = s.ErsDepLapJ;
            if (dep < minErsDepLapJ) minErsDepLapJ = dep;
            if (dep > maxErsDepLapJ) maxErsDepLapJ = dep;
        }

        var ersUsedLapJ = Math.Max(0f, maxErsDepLapJ - minErsDepLapJ);
        var ersUsage = Math.Clamp(ersUsedLapJ / ErsMaxLapJ, 0f, 1f);
        var drsUsage = hasZones
            ? (drsZoneSamples > 0 ? (float)drsOnInZone / drsZoneSamples : 0f)
            : (float)samples.Count(s => s.Drs == 1) / samples.Count;
        var perfPct = Math.Clamp((ersUsage * Wers + drsUsage * Wdrs) * 100f, 0f, 100f);

        return new
        {
            perfPct = (byte)MathF.Round(perfPct),
            ersUsagePct = (byte)MathF.Round(ersUsage * 100f),
            drsUsagePct = (byte)MathF.Round(drsUsage * 100f),
            drsZoneBased = hasZones,
            weights = new { ers = Wers, drs = Wdrs },
        };
    }

    [STAThread]
    static void Main(string[] args)
    {
        var app = new TelemetryTrayApp(args);
        app.Run();
    }

    internal static WebApplication BuildWebApp(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);

        var userConfigPath = Path.Combine(AppContext.BaseDirectory, "appsettings.user.json");
        builder.Configuration.AddJsonFile(userConfigPath, optional: true, reloadOnChange: true);

        var appSettings = builder.Configuration.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
        builder.WebHost.UseUrls($"http://0.0.0.0:{appSettings.WebPort}");

        // Apply the persisted History folder (Settings tab) so reads and writes both target it
        // from the very first request. The History tab's "Select Folder" can temporarily
        // override the read root on top of this baseline, but never persists.
        HistoryRoot.PersistentDefault = HistoryRoot.Resolve(appSettings.HistoryFolder);

        builder.Services.Configure<TelemetryUdpOptions>(
            builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));
        builder.Services.Configure<AppSettings>(
            builder.Configuration.GetSection(AppSettings.SectionName));

        builder.Services.AddF125Protocol();
        builder.Services.AddSingleton<TelemetryState>();
        builder.Services.AddSingleton<LapSetupStore>();
        builder.Services.AddSingleton<LapTyreStore>();
        builder.Services.AddSingleton<SessionLogger>();
        builder.Services.AddHostedService<SessionLoggerWriter>();
        var drsZonesPath = Path.Combine(AppContext.BaseDirectory, "wwwroot", "data", "drs-zones.json");
        builder.Services.AddSingleton(new DrsZoneStore(drsZonesPath));
        builder.Services.AddSingleton<AutoDrsZoneCaptureService>();

        builder.Services.AddSingleton<DebugPacketTracker>();
        builder.Services.AddSingleton<IngressDiagnosticsTracker>();
        builder.Services.AddSingleton<ITelemetryIngress, TelemetryPipelineIngress>();
        builder.Services.AddTelemetryUdpListener();
        builder.Services.AddSignalR()
            .AddJsonProtocol(options =>
            {
                var json = options.PayloadSerializerOptions;
                json.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
                json.Converters.Add(new FiniteSingleJsonConverter());
                json.Converters.Add(new FiniteDoubleJsonConverter());
            });

        builder.Services.ConfigureHttpJsonOptions(o =>
        {
            var json = o.SerializerOptions;
            json.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
            json.PropertyNameCaseInsensitive = true;
            json.Converters.Add(new FiniteSingleJsonConverter());
            json.Converters.Add(new FiniteDoubleJsonConverter());
        });

        builder.Services.AddResponseCompression(opts =>
        {
            opts.EnableForHttps = true;
            opts.Providers.Add<BrotliCompressionProvider>();
            opts.Providers.Add<GzipCompressionProvider>();
            opts.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(
                new[] { "application/octet-stream" });
        });
        builder.Services.Configure<BrotliCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);
        builder.Services.Configure<GzipCompressionProviderOptions>(o => o.Level = CompressionLevel.Fastest);

        builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(3));

        var app = builder.Build();

        app.Services.GetRequiredService<DebugPacketTracker>().PacketNameResolver = F125PacketNames.Get;

        var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
        lifetime.ApplicationStopping.Register(() =>
            app.Services.GetRequiredService<SessionLogger>().Flush());

        app.UseResponseCompression();
        app.UseDefaultFiles();
        app.UseStaticFiles();

        app.MapHub<TelemetryHub>("/hub/telemetry");

        MapApiEndpoints(app);

        return app;
    }

    private static void MapApiEndpoints(WebApplication app)
    {
        app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "f1-telemetry" }));

        app.MapGet("/api/info", (IConfiguration config) => Results.Ok(new
        {
            game = "F1 25",
            udpAddress = config.GetValue<string>("TelemetryUdp:ListenAddress") ?? "0.0.0.0",
            udpPort = config.GetValue<int?>("TelemetryUdp:Port") ?? 20777,
            webPort = config.GetValue<int?>("App:WebPort") ?? 5000,
            debugMode = config.GetValue<bool?>("App:DebugMode") ?? false,
            packetTypes = Enum.GetValues<F125PacketId>().Select(v => F125PacketNames.Get((byte)v)).ToArray()
        }));

        app.MapGet("/api/state", (TelemetryState state) =>
        {
            var all = state.GetAll();
            var result = new Dictionary<string, object>();
            foreach (var (key, value) in all)
            {
                var name = F125PacketNames.Get(key);
                result[name] = value;
            }
            return Results.Ok(result);
        });

        app.MapGet("/api/state/{packetType}", (string packetType, TelemetryState state) =>
        {
            if (!Enum.TryParse<F125PacketId>(packetType, true, out var packetId))
                return Results.NotFound(new { error = $"Unknown packet type: {packetType}" });

            var data = state.Get((byte)packetId);
            return data != null ? Results.Ok(data) : Results.NotFound(new { error = $"No data for {packetType}" });
        });

        app.MapGet("/api/settings", (IConfiguration config, IOptionsMonitor<AppSettings> appSettings) =>
        {
            var udpSection = config.GetSection("TelemetryUdp");
            var s = appSettings.CurrentValue;
            return Results.Ok(new
            {
                udpListenIp = udpSection.GetValue<string>("ListenAddress") ?? "0.0.0.0",
                udpListenPort = udpSection.GetValue<int?>("Port") ?? 20777,
                webPort = s.WebPort,
                debugMode = s.DebugMode,
                enableSessionLogging = s.EnableSessionLogging,
                historyFolder = s.HistoryFolder,
                historyFolderResolved = HistoryRoot.PersistentDefault,
                historyFolderDefault = HistoryRoot.BuiltInDefault,
            });
        });

        app.MapPost("/api/settings", async (HttpContext ctx, IConfiguration config) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<SettingsUpdateRequest>();
            if (body is null)
                return Results.BadRequest("Invalid request body");

            // Validate the History folder before touching anything else: a non-empty value
            // that points nowhere should fail loudly so the UI can show an error.
            string? historyFolder = string.IsNullOrWhiteSpace(body.HistoryFolder) ? null : body.HistoryFolder!.Trim();
            if (historyFolder != null)
            {
                var resolved = HistoryRoot.Resolve(historyFolder);
                if (!Directory.Exists(resolved))
                    return Results.BadRequest(new { error = "history folder does not exist", path = resolved });
            }

            var configPath = Path.Combine(AppContext.BaseDirectory, "appsettings.user.json");
            var existing = new Dictionary<string, object>();
            if (File.Exists(configPath))
            {
                var json = await File.ReadAllTextAsync(configPath);
                existing = JsonSerializer.Deserialize<Dictionary<string, object>>(json)
                           ?? new Dictionary<string, object>();
            }

            existing["TelemetryUdp"] = new { ListenAddress = body.UdpListenIp, Port = body.UdpListenPort };
            var currentApp = config.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
            existing["App"] = new
            {
                WebPort = body.WebPort,
                DebugMode = body.DebugMode,
                EnableSessionLogging = body.EnableSessionLogging,
                LaunchBrowserOnStart = currentApp.LaunchBrowserOnStart,
                HistoryFolder = historyFolder,
            };

            // Apply immediately so subsequent reads/writes target the new path without
            // needing a restart. PersistentDefault setter also clears any ephemeral override.
            HistoryRoot.PersistentDefault = HistoryRoot.Resolve(historyFolder);

            var newJson = JsonSerializer.Serialize(existing,
                new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(configPath, newJson);

            return Results.Ok(new
            {
                saved = true,
                message = "Settings saved. Web port changes require a restart."
            });
        });

        app.MapPost("/api/game/configure-udp", async (IConfiguration config) =>
        {
            var udpSection = config.GetSection("TelemetryUdp");
            var listenIp = udpSection.GetValue<string>("ListenAddress") ?? "0.0.0.0";
            var port = udpSection.GetValue<int?>("Port") ?? 20777;

            var sendIp = (string.IsNullOrWhiteSpace(listenIp) || listenIp == "0.0.0.0" || listenIp == "::")
                ? "127.0.0.1"
                : listenIp;

            var docs = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
            var xmlPath = Path.Combine(docs, "My Games", "F1 25", "hardwaresettings", "hardware_settings_config.xml");

            if (!File.Exists(xmlPath))
            {
                return Results.NotFound(new
                {
                    error = "hardware_settings_config.xml not found. Launch F1 25 once to create it.",
                    expectedPath = xmlPath
                });
            }

            try
            {
                await File.WriteAllBytesAsync(xmlPath + ".bak", await File.ReadAllBytesAsync(xmlPath));

                XDocument doc;
                using (var fs = File.OpenRead(xmlPath))
                    doc = XDocument.Load(fs);

                var motion = doc.Root?.Element("motion") ?? doc.Descendants("motion").FirstOrDefault();
                if (motion == null)
                    return Results.Problem("No <motion> element in XML.", statusCode: 500);

                var udp = motion.Element("udp");
                if (udp == null)
                {
                    udp = new XElement("udp");
                    motion.Add(udp);
                }

                udp.SetAttributeValue("enabled", "true");
                udp.SetAttributeValue("broadcast", "true");
                udp.SetAttributeValue("ip", sendIp);
                udp.SetAttributeValue("port", port.ToString());
                udp.SetAttributeValue("sendRate", "60");
                udp.SetAttributeValue("format", "2025");
                udp.SetAttributeValue("yourTelemetry", "public");
                udp.SetAttributeValue("onlineNames", "on");

                doc.Save(xmlPath);

                return Results.Ok(new
                {
                    saved = true,
                    path = xmlPath,
                    ip = sendIp,
                    port
                });
            }
            catch (Exception ex)
            {
                return Results.Problem($"Failed to update XML: {ex.Message}", statusCode: 500);
            }
        });

        var pitTimesPath = Path.Combine(app.Environment.WebRootPath, "data", "pit-times.json");

        app.MapGet("/api/pit-times", async () =>
        {
            var cache = await LoadPitTimesAsync(pitTimesPath);
            await _pitTimesLock.WaitAsync();
            try
            {
                // Shallow snapshot so the serializer can't race with a concurrent PUT.
                return Results.Ok(new Dictionary<string, JsonElement>(cache));
            }
            finally { _pitTimesLock.Release(); }
        });

        app.MapGet("/api/pit-times/{trackId}", async (string trackId) =>
        {
            var cache = await LoadPitTimesAsync(pitTimesPath);
            return cache.TryGetValue(trackId, out var entry)
                ? Results.Ok(entry)
                : Results.NotFound(new { error = $"No pit time for track {trackId}" });
        });

        app.MapPut("/api/pit-times/{trackId}", async (string trackId, HttpContext ctx) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<PitTimeUpdateRequest>();
            if (body is null || body.PitTimeSec <= 0)
                return Results.BadRequest("Invalid pit time");

            var cache = await LoadPitTimesAsync(pitTimesPath);

            var entryJson = JsonSerializer.SerializeToElement(new
            {
                trackName = body.TrackName ?? $"Track {trackId}",
                pitTimeSec = body.PitTimeSec
            });

            await _pitTimesLock.WaitAsync();
            try
            {
                cache[trackId] = entryJson;

                var dir = Path.GetDirectoryName(pitTimesPath);
                if (dir != null && !Directory.Exists(dir))
                    Directory.CreateDirectory(dir);

                var newJson = JsonSerializer.Serialize(cache,
                    new JsonSerializerOptions { WriteIndented = true });
                await File.WriteAllTextAsync(pitTimesPath, newJson);
            }
            finally { _pitTimesLock.Release(); }

            return Results.Ok(new { saved = true, trackId, pitTimeSec = body.PitTimeSec });
        });

        app.MapGet("/api/debug/stats", (DebugPacketTracker tracker) =>
        {
            return Results.Ok(new
            {
                total = tracker.TotalPackets,
                counts = tracker.GetPacketCountsByName()
            });
        });

        app.MapGet("/api/debug/log", (DebugPacketTracker tracker) =>
        {
            var entries = tracker.GetRecentEntries();
            return Results.Ok(entries.Select(e => new
            {
                timestamp = e.Timestamp.ToString("HH:mm:ss.fff"),
                name = F125PacketNames.Get(e.PacketId)
            }));
        });

        app.MapGet("/api/debug/log/download", (DebugPacketTracker tracker) =>
        {
            var text = tracker.ExportLog();
            return Results.Text(text, "text/plain");
        });

        app.MapPost("/api/debug/reset", (DebugPacketTracker tracker) =>
        {
            tracker.Reset();
            return Results.Ok(new { reset = true });
        });

        // --- Debug: DRS zones inspector ---
        // Lists every known track plus its current state in drs-zones.json. The
        // current-track block exposes the id of the live session so the UI can offer a
        // "re-capture" button only when the player is actually on track.
        app.MapGet("/api/debug/drs-zones", (DrsZoneStore store, AutoDrsZoneCaptureService capture, TelemetryState state) =>
        {
            var zonesByTrack = store.Load();
            var session = state.Get<SessionPacket>((byte)F125PacketId.Session);
            int? currentTrackId = session != null ? session.TrackId : null;

            var tracks = F125TrackNames.GetAll().Select(kv =>
            {
                var has = zonesByTrack.TryGetValue(kv.Key, out var zones) && zones.Length > 0;
                float coverage = 0f;
                if (has)
                    foreach (var (s, e) in zones!) coverage += e - s;
                return new
                {
                    trackId = kv.Key,
                    trackName = kv.Value,
                    hasZones = has,
                    zoneCount = has ? zones!.Length : 0,
                    coverage = (float)Math.Round(coverage, 4),
                    zones = has
                        ? zones!.Select(z => new[] { z.Start, z.End }).ToArray()
                        : Array.Empty<float[]>(),
                };
            }).ToArray();

            return Results.Ok(new
            {
                currentTrackId,
                currentTrackName = currentTrackId.HasValue ? F125TrackNames.Get(currentTrackId.Value) : null,
                captureStatus = capture.GetStatus(),
                tracks,
            });
        });

        // Wipes the JSON entry for one track and re-arms auto-capture so the next valid
        // practice/quali/TT lap on that track triggers a fresh capture.
        app.MapPost("/api/debug/drs-zones/{trackId:int}/recapture",
            async (int trackId, DrsZoneStore store, AutoDrsZoneCaptureService capture) =>
        {
            await store.DeleteTrackAsync(trackId);
            capture.Forget(trackId);
            return Results.Ok(new { trackId, recaptureArmed = true });
        });

        // --- Sessions (History) ---

        app.MapGet("/api/sessions", () =>
        {
            var logsDir = HistoryRoot.Path;
            if (!Directory.Exists(logsDir))
                return Results.Ok(Array.Empty<object>());

            // Stat-only version: sum of top-dir + each subdir's last-write ticks, plus the
            // root path itself so switching to a different source folder always invalidates.
            long version = HashCode.Combine(logsDir.GetHashCode(), Directory.GetLastWriteTimeUtc(logsDir).Ticks);
            foreach (var dir in Directory.EnumerateDirectories(logsDir))
                version = HashCode.Combine(version, Directory.GetLastWriteTimeUtc(dir).Ticks);

            lock (_sessionsCacheLock)
            {
                if (_sessionsCacheValue != null && _sessionsCacheVersion == version)
                    return Results.Ok(_sessionsCacheValue);
            }

            var weekends = new List<object>();

            foreach (var dir in Directory.GetDirectories(logsDir).OrderByDescending(d => d))
            {
                var folder = Path.GetFileName(dir);

                // Skip hidden / system / dot- / underscore-prefixed dirs (e.g. _ghosts, .git,
                // node_modules artifacts) so a user-picked folder full of unrelated content
                // doesn't pollute the History grid.
                if (folder.Length == 0 || folder[0] == '.' || folder[0] == '_') continue;
                if (TryGetAttributes(dir, out var dirAttrs) &&
                    (dirAttrs & (FileAttributes.Hidden | FileAttributes.System)) != 0) continue;

                var files = Directory.GetFiles(dir, "*.json");
                if (files.Length == 0) continue;

                int? trackId = null;
                string? trackName = null;
                byte? gameYear = null;
                byte? formula = null;
                string? formulaName = null;
                var sessions = new List<object>();

                foreach (var file in files.OrderBy(f => f))
                {
                    var fileName = Path.GetFileName(file);
                    if (fileName.Length == 0 || fileName[0] == '.' || fileName[0] == '_') continue;

                    // Stream-read only the top-level "meta" object. Session logs are multi-MB
                    // (Drivers, LapHistories, Packets) but the History grid needs ~5 fields from
                    // the start of the file. Reading 64 KB instead of 50 MB is a 100× speed win.
                    // For very old logs that have no embedded meta, synthesize a header from the
                    // folder name (F1{year}_{track}_{date}) and the filename slug so the card
                    // still appears in History — just without a trackId-driven flag.
                    if (!TryReadSessionMeta(file, out var meta) &&
                        !TrySynthesizeHeaderFromPath(file, dir, out meta)) continue;

                    if (!trackId.HasValue && meta.TrackId.HasValue) trackId = meta.TrackId;
                    trackName ??= meta.TrackName;
                    if (!gameYear.HasValue && meta.GameYear.HasValue)
                        gameYear = meta.GameYear;
                    if (!formula.HasValue && meta.Formula.HasValue)
                    {
                        formula = meta.Formula;
                        formulaName = !string.IsNullOrEmpty(meta.FormulaName)
                            ? meta.FormulaName
                            : F125Formulas.GetName(meta.Formula.Value);
                    }

                    sessions.Add(new
                    {
                        slug = Path.GetFileNameWithoutExtension(file),
                        typeName = meta.SessionTypeName,
                        savedAt = meta.SavedAt,
                    });
                }

                if (sessions.Count > 0)
                {
                    weekends.Add(new
                    {
                        folder,
                        trackId,
                        trackName,
                        gameYear,
                        formula,
                        formulaName,
                        sessions,
                    });
                }
            }

            lock (_sessionsCacheLock)
            {
                _sessionsCacheValue = weekends;
                _sessionsCacheVersion = version;
            }

            return Results.Ok(weekends);
        });

        // Session detail: meta + per-driver lap summaries (NO samples/motion). Small enough
        // to hold in the browser for the whole lifetime of the detail view.
        app.MapGet("/api/sessions/{folder}/{slug}", (string folder, string slug, DrsZoneStore store) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data == null)
                return Results.NotFound(new { error = "session not found or schema < v2" });

            var drivers = data.Drivers?.ToDictionary(
                kv => kv.Key,
                kv => new
                {
                    carIdx = kv.Value.CarIdx,
                    teamId = kv.Value.TeamId,
                    driverId = kv.Value.DriverId,
                    name = kv.Value.Name,
                    liveryColorHex = kv.Value.LiveryColorHex,
                    lapCount = kv.Value.Laps.Count,
                    laps = kv.Value.Laps.Select(l => new
                    {
                        l.LapNum, l.LapTimeMs, l.S1Ms, l.S2Ms, l.S3Ms,
                        l.CompoundActual, l.CompoundVisual, l.TyreAge, l.TyreWearEnd,
                        l.Valid, l.Pit, l.Position, l.GapToLeaderMs, l.RaceFlag,
                        l.BlueFlag,
                        // Per-lap Performance aggregate for the Race Lap Times view. Computed
                        // here (not persisted) from the lap's 20 Hz samples so old logs still
                        // light up after an app upgrade — and so we don't pay for it when the
                        // caller doesn't need it (samples themselves stay out of this payload).
                        Perf = ComputeLapPerf(
                            l.Samples,
                            data.Meta?.TrackId ?? -1,
                            data.Meta?.TrackLengthM ?? 0f,
                            store),
                    }).ToArray(),
                    tyreByLap = kv.Value.TyreByLap,
                });

            return Results.Ok(new
            {
                meta = data.Meta,
                drivers,
                lapHistories = data.LapHistories,
                events = data.Events,
                finalClassification = data.FinalClassification,
            });
        });

        // Per-driver lap summaries only (compact).
        app.MapGet("/api/sessions/{folder}/{slug}/laps", (string folder, string slug) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data == null)
                return Results.NotFound(new { error = "session not found" });

            if (data.Drivers == null)
                return Results.Ok(new Dictionary<int, object>());

            var laps = data.Drivers.ToDictionary(
                kv => kv.Key,
                kv => (object)kv.Value.Laps.Select(l => new
                {
                    l.LapNum, l.LapTimeMs, l.S1Ms, l.S2Ms, l.S3Ms,
                    l.CompoundActual, l.CompoundVisual, l.TyreAge, l.TyreWearEnd,
                    l.Valid, l.Pit, l.Position, l.GapToLeaderMs, l.RaceFlag,
                }).ToArray());

            return Results.Ok(laps);
        });

        // Lazy-load samples + motion for one lap of one driver. Called by Telemetry Compare
        // when the user picks a lap from the per-driver dropdown. Cached on the client.
        app.MapGet("/api/sessions/{folder}/{slug}/lap-samples",
            (string folder, string slug, int carIdx, int lap) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data?.Drivers == null || !data.Drivers.TryGetValue(carIdx, out var driver))
                return Results.NotFound(new { error = "driver not found" });

            var match = driver.Laps.FirstOrDefault(l => l.LapNum == lap);
            if (match == null)
                return Results.NotFound(new { error = "lap not found" });

            // Trim pit-lane samples: F1 telemetry reports negative lapDistance while a car
            // is in the pit lane. Quali outlaps land in lap 1's buffer with the pit-exit
            // trail attached, and inlaps land with the pit-entry trail — both pollute the
            // racing-line visualisation. Clip to [0, trackLen + small overshoot] so only
            // on-track points reach the chart/map.
            var trackLen = data.Meta?.TrackLengthM ?? 0f;
            var maxD = trackLen > 0f ? trackLen + 50f : float.MaxValue;
            var samples = (match.Samples ?? new List<LapSample>())
                .Where(s => s.D >= 0f && s.D <= maxD)
                .ToList();
            var motion = (match.Motion ?? new List<MotionSample>())
                .Where(m => m.D >= 0f && m.D <= maxD)
                .ToList();

            return Results.Ok(new
            {
                carIdx,
                lap = match.LapNum,
                samples,
                motion,
            });
        });

        app.MapGet("/api/sessions/{folder}/{slug}/events", (string folder, string slug) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data == null)
                return Results.NotFound(new { error = "session not found" });
            return Results.Ok(data.Events ?? new List<SessionLogEventV2>());
        });

        // Export one driver's full session data as a standalone JSON. The payload stays compatible
        // with /api/history/import so two instances can swap ghost files directly.
        app.MapGet("/api/sessions/{folder}/{slug}/export", (string folder, string slug, int carIdx) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data?.Drivers == null || !data.Drivers.TryGetValue(carIdx, out var driver))
                return Results.NotFound(new { error = "driver not found" });

            var payload = new
            {
                schemaVersion = 2,
                sourceFolder = folder,
                sourceSlug = slug,
                meta = data.Meta,
                driver,
            };
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
                WriteIndented = false,
                Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            };
            var bytes = JsonSerializer.SerializeToUtf8Bytes(payload, jsonOptions);
            var filename = $"{folder}__{slug}__car{carIdx}.json";
            return Results.File(bytes, "application/json", filename);
        });

        // Import a ghost driver. Stored on disk under _ghosts/ so re-opening the session picks
        // them up via /ghosts without a re-upload.
        app.MapPost("/api/history/import", async (HttpContext ctx, string folder, string slug) =>
        {
            var target = HistoryReader.Load(folder, slug);
            if (target?.Meta == null)
                return Results.NotFound(new { error = "target session not found" });

            using var ms = new MemoryStream();
            await ctx.Request.Body.CopyToAsync(ms);
            ms.Position = 0;
            JsonElement root;
            try
            {
                using var doc = JsonDocument.Parse(ms);
                root = doc.RootElement.Clone();
            }
            catch
            {
                return Results.BadRequest(new { error = "invalid JSON" });
            }

            if (!root.TryGetProperty("schemaVersion", out var sv) || sv.GetInt32() != 2)
                return Results.BadRequest(new { error = "schema mismatch (expected v2)" });
            if (!root.TryGetProperty("meta", out var meta) ||
                !meta.TryGetProperty("trackId", out var tid) || tid.GetInt32() != target.Meta.TrackId)
                return Results.BadRequest(new { error = "track mismatch" });
            if (!root.TryGetProperty("driver", out var driverEl))
                return Results.BadRequest(new { error = "no driver payload" });

            var safeFolder = Path.GetFileName(folder);
            var ghostsDir = Path.Combine(HistoryRoot.Path, safeFolder, "_ghosts");
            Directory.CreateDirectory(ghostsDir);
            var fileName = $"ghost_{DateTimeOffset.UtcNow.ToUnixTimeSeconds()}.json";
            var path = Path.Combine(ghostsDir, fileName);
            await File.WriteAllTextAsync(path, root.GetRawText());

            return Results.Ok(new
            {
                imported = true,
                driver = driverEl,
                fileName,
            });
        });

        // Serves a hand-crafted outline from wwwroot/assets/tracks/{trackId}.svg.
        // Auto-generation from motion data was removed — the synthesized outlines
        // were too noisy to be useful. Missing files return 404 and the front-end
        // simply renders the racing line without a track backdrop.
        app.MapGet("/api/sessions/{folder}/{slug}/track-svg",
            (string folder, string slug, IWebHostEnvironment env) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data?.Meta == null)
                return Results.NotFound(new { error = "session not found" });

            var path = Path.Combine(env.WebRootPath, "assets", "tracks", $"{data.Meta.TrackId}.svg");
            if (!File.Exists(path))
                return Results.NotFound(new { error = "no hand-crafted outline for this track" });

            return Results.Content(File.ReadAllText(path), "image/svg+xml");
        });

        app.MapGet("/api/sessions/{folder}/{slug}/ghosts", (string folder, string slug) =>
        {
            var target = HistoryReader.Load(folder, slug);
            if (target?.Meta == null)
                return Results.NotFound(new { error = "session not found" });

            var safeFolder = Path.GetFileName(folder);
            var ghostsDir = Path.Combine(HistoryRoot.Path, safeFolder, "_ghosts");
            if (!Directory.Exists(ghostsDir)) return Results.Ok(Array.Empty<object>());

            var ghosts = new List<object>();
            foreach (var file in Directory.GetFiles(ghostsDir, "*.json"))
            {
                try
                {
                    using var stream = File.OpenRead(file);
                    using var doc = JsonDocument.Parse(stream);
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("meta", out var m) ||
                        !m.TryGetProperty("trackId", out var tid) ||
                        tid.GetInt32() != target.Meta.TrackId) continue;
                    ghosts.Add(new
                    {
                        fileName = Path.GetFileName(file),
                        driver = root.GetProperty("driver").Clone(),
                        sourceSlug = root.TryGetProperty("sourceSlug", out var ss) ? ss.GetString() : null,
                    });
                }
                catch { /* skip corrupt ghost */ }
            }
            return Results.Ok(ghosts);
        });

        app.MapPost("/api/sessions/open-folder", (OpenFolderRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Folder))
                return Results.BadRequest(new { error = "folder is required" });

            // Sanitize: only allow folder name, no path traversal
            var safeName = Path.GetFileName(req.Folder);
            var fullPath = Path.Combine(HistoryRoot.Path, safeName);

            if (!Directory.Exists(fullPath))
                return Results.NotFound(new { error = "folder not found" });

            System.Diagnostics.Process.Start("explorer.exe", fullPath);
            return Results.Ok(new { opened = true });
        });

        // Delete a weekend folder (and all of its session files) from the History root.
        // Folder name is sanitized to prevent path traversal — only a leaf name is accepted,
        // and the resolved path must live inside HistoryRoot.Path.
        app.MapDelete("/api/sessions/{folder}", (string folder) =>
        {
            if (string.IsNullOrWhiteSpace(folder))
                return Results.BadRequest(new { error = "folder is required" });

            var safeName = Path.GetFileName(folder);
            if (string.IsNullOrEmpty(safeName) || safeName != folder)
                return Results.BadRequest(new { error = "invalid folder name" });

            var root = Path.GetFullPath(HistoryRoot.Path);
            var fullPath = Path.GetFullPath(Path.Combine(root, safeName));
            if (!fullPath.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "invalid folder path" });

            if (!Directory.Exists(fullPath))
                return Results.NotFound(new { error = "folder not found" });

            try
            {
                Directory.Delete(fullPath, recursive: true);
            }
            catch (Exception ex)
            {
                return Results.Problem("Failed to delete folder: " + ex.Message, statusCode: 500);
            }
            return Results.Ok(new { deleted = true });
        });

        // --- History source folder ---

        app.MapGet("/api/sessions/source", () =>
        {
            var path = HistoryRoot.Path;
            return Results.Ok(new
            {
                path,
                isDefault = HistoryRoot.IsDefault,
                defaultPath = HistoryRoot.PersistentDefault,
                builtInDefault = HistoryRoot.BuiltInDefault,
                exists = Directory.Exists(path),
            });
        });

        // Set the History view's read root for the current process. Pass null/empty to revert
        // to the persisted default (Settings tab). The override is intentionally NOT persisted —
        // every app restart re-reads from the persisted default.
        app.MapPost("/api/sessions/source", async (HttpContext ctx) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<HistorySourceUpdateRequest>();
            var newPath = body?.Path;

            if (string.IsNullOrWhiteSpace(newPath))
            {
                HistoryRoot.OverrideForSession(null);
            }
            else
            {
                var resolved = HistoryRoot.Resolve(newPath);
                if (!Directory.Exists(resolved))
                    return Results.BadRequest(new { error = "folder does not exist", path = resolved });
                HistoryRoot.OverrideForSession(resolved);
            }

            return Results.Ok(new
            {
                path = HistoryRoot.Path,
                isDefault = HistoryRoot.IsDefault,
                defaultPath = HistoryRoot.PersistentDefault,
            });
        });

        // Opens a native WPF folder picker on the app's UI thread and returns the chosen path.
        // Returns 204 No Content if the user cancels. Only works when the WPF Application is alive
        // (i.e. running as the tray app, not a headless web host).
        // Await Dispatcher.InvokeAsync (not synchronous Invoke) so the request thread never blocks
        // waiting on the WPF pump in a way that can deadlock with the UI thread hosting Kestrel.
        app.MapPost("/api/sessions/source/browse", async () =>
        {
            var wpfApp = System.Windows.Application.Current;
            if (wpfApp == null)
                return Results.Problem("native folder picker is unavailable in headless mode", statusCode: 503);

            try
            {
                var picked = await wpfApp.Dispatcher.InvokeAsync(() =>
                {
                    // This host is tray-only (no MainWindow). Win32 folder dialogs need a visible
                    // owner HWND; without one, ShowDialog() often returns false immediately (204).
                    var owner = new Window
                    {
                        Width = 0,
                        Height = 0,
                        Left = -10_000,
                        Top = -10_000,
                        ShowInTaskbar = false,
                        WindowStyle = WindowStyle.None,
                        AllowsTransparency = true,
                        Background = Brushes.Transparent,
                        Opacity = 0,
                        Topmost = true,
                    };
                    owner.Show();
                    try
                    {
                        var dlg = new Microsoft.Win32.OpenFolderDialog
                        {
                            Title = "Select History Source Folder",
                            InitialDirectory = Directory.Exists(HistoryRoot.Path)
                                ? HistoryRoot.Path
                                : HistoryRoot.PersistentDefault,
                        };
                        return dlg.ShowDialog(owner) == true ? dlg.FolderName : null;
                    }
                    finally
                    {
                        owner.Close();
                    }
                });

                return picked == null
                    ? Results.NoContent()
                    : Results.Ok(new { path = picked });
            }
            catch (Exception ex)
            {
                return Results.Problem(
                    title: "Folder picker failed",
                    detail: ex.Message,
                    statusCode: 500);
            }
        });
    }
}

record HistorySourceUpdateRequest(string? Path);

record SettingsUpdateRequest(
    [property: JsonPropertyName("udpListenIp")] string UdpListenIp,
    [property: JsonPropertyName("udpListenPort")] int UdpListenPort,
    [property: JsonPropertyName("webPort")] int WebPort,
    [property: JsonPropertyName("debugMode")] bool DebugMode,
    [property: JsonPropertyName("enableSessionLogging")] bool EnableSessionLogging,
    [property: JsonPropertyName("historyFolder")] string? HistoryFolder);

record OpenFolderRequest(string Folder);

record PitTimeUpdateRequest(
    string? TrackName,
    double PitTimeSec);
