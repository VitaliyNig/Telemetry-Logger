using System.IO;
using System.IO.Compression;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using Microsoft.Extensions.Options;
using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Host.Logging;
using F1Telemetry.Host.Serialization;
using F1Telemetry.Ingress;
using F1Telemetry.State;
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

    /// <summary>
    /// Aggregates a lap's 20 Hz sample stream into a compact "how hard was the car pushed?"
    /// summary for the Race Lap Times view. Returns null when samples are unavailable so the
    /// client can render an em-dash without guessing. ERS mode >= 2 = Hotlap/Overtake per the
    /// UDP spec; DRS 1 = active. Fuel mix is left null — it isn't in LapSample yet.
    /// </summary>
    private static object? ComputeLapPerf(List<LapSample>? samples)
    {
        if (samples == null || samples.Count == 0) return null;
        var total = samples.Count;
        double ersSum = 0;
        int ersHot = 0;
        int drsOn = 0;
        for (int i = 0; i < total; i++)
        {
            var s = samples[i];
            ersSum += s.Ers;
            if (s.ErsMd >= 2) ersHot++;
            if (s.Drs == 1) drsOn++;
        }
        return new
        {
            ersAvg = (float)(ersSum / total),
            ersHotFrac = (float)ersHot / total,
            drsFrac = (float)drsOn / total,
            fuelMixMode = (int?)null,
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

        // Apply persisted history-folder override (if any) before any History endpoint resolves a path.
        HistoryRoot.Path = HistoryRoot.Resolve(appSettings.HistoryFolder);

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
        builder.Services.AddSingleton<DebugPacketTracker>();
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
                enableSessionLogging = s.EnableSessionLogging
            });
        });

        app.MapPost("/api/settings", async (HttpContext ctx, IConfiguration config) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<SettingsUpdateRequest>();
            if (body is null)
                return Results.BadRequest("Invalid request body");

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
                HistoryFolder = currentApp.HistoryFolder,
            };

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
                var files = Directory.GetFiles(dir, "*.json");
                if (files.Length == 0) continue;

                int? trackId = null;
                string? trackName = null;
                byte? gameYear = null;
                var sessions = new List<object>();

                foreach (var file in files.OrderBy(f => f))
                {
                    try
                    {
                        using var stream = System.IO.File.OpenRead(file);
                        using var doc = JsonDocument.Parse(stream);
                        var meta = doc.RootElement.GetProperty("meta");

                        trackId ??= meta.GetProperty("trackId").GetInt32();
                        trackName ??= meta.GetProperty("trackName").GetString();
                        if (!gameYear.HasValue && meta.TryGetProperty("gameYear", out var gy))
                            gameYear = gy.GetByte();

                        sessions.Add(new
                        {
                            slug = Path.GetFileNameWithoutExtension(file),
                            typeName = meta.GetProperty("sessionTypeName").GetString(),
                            savedAt = meta.GetProperty("savedAt").GetString(),
                        });
                    }
                    catch { /* skip corrupt files */ }
                }

                if (sessions.Count > 0)
                {
                    weekends.Add(new
                    {
                        folder,
                        trackId,
                        trackName,
                        gameYear,
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
        app.MapGet("/api/sessions/{folder}/{slug}", (string folder, string slug) =>
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
                        Perf = ComputeLapPerf(l.Samples),
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

            return Results.Ok(new
            {
                carIdx,
                lap = match.LapNum,
                samples = match.Samples ?? new List<LapSample>(),
                motion = match.Motion ?? new List<MotionSample>(),
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

        app.MapGet("/api/sessions/{folder}/{slug}/track-svg",
            (string folder, string slug, IWebHostEnvironment env) =>
        {
            var data = HistoryReader.Load(folder, slug);
            if (data?.Meta == null)
                return Results.NotFound(new { error = "session not found" });

            var cachePath = TrackSvgGenerator.CachePath(env.WebRootPath, data.Meta.TrackId);
            if (File.Exists(cachePath))
            {
                var cached = File.ReadAllText(cachePath);
                return Results.Content(cached, "image/svg+xml");
            }

            var svg = TrackSvgGenerator.TryGenerate(data);
            if (svg == null)
                return Results.NotFound(new { error = "not enough motion data" });

            try
            {
                var dir = Path.GetDirectoryName(cachePath);
                if (dir != null && !Directory.Exists(dir)) Directory.CreateDirectory(dir);
                File.WriteAllText(cachePath, svg);
            }
            catch { /* cache write failures don't block the response */ }

            return Results.Content(svg, "image/svg+xml");
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

        // --- History source folder ---

        app.MapGet("/api/sessions/source", () =>
        {
            var path = HistoryRoot.Path;
            return Results.Ok(new
            {
                path,
                isDefault = HistoryRoot.IsDefault,
                defaultPath = HistoryRoot.DefaultPath,
                exists = Directory.Exists(path),
            });
        });

        // Persist an absolute path (or null = reset to default Logs/) as the History view's source.
        app.MapPost("/api/sessions/source", async (HttpContext ctx) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<HistorySourceUpdateRequest>();
            string? newPath = body?.Path;

            string resolved;
            if (string.IsNullOrWhiteSpace(newPath))
            {
                resolved = HistoryRoot.DefaultPath;
                newPath = null;
            }
            else
            {
                resolved = HistoryRoot.Resolve(newPath);
                if (!Directory.Exists(resolved))
                    return Results.BadRequest(new { error = "folder does not exist", path = resolved });
            }

            HistoryRoot.Path = resolved;

            // Persist to user config so the choice survives restart.
            var configPath = Path.Combine(AppContext.BaseDirectory, "appsettings.user.json");
            var existing = new Dictionary<string, object>();
            if (File.Exists(configPath))
            {
                var json = await File.ReadAllTextAsync(configPath);
                existing = JsonSerializer.Deserialize<Dictionary<string, object>>(json)
                           ?? new Dictionary<string, object>();
            }

            var currentApp = app.Configuration.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
            existing["App"] = new
            {
                WebPort = currentApp.WebPort,
                DebugMode = currentApp.DebugMode,
                EnableSessionLogging = currentApp.EnableSessionLogging,
                LaunchBrowserOnStart = currentApp.LaunchBrowserOnStart,
                HistoryFolder = newPath,
            };

            var newJson = JsonSerializer.Serialize(existing,
                new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(configPath, newJson);

            return Results.Ok(new
            {
                path = resolved,
                isDefault = HistoryRoot.IsDefault,
            });
        });

        // Opens a native WPF folder picker on the app's UI thread and returns the chosen path.
        // Returns 204 No Content if the user cancels. Only works when the WPF Application is alive
        // (i.e. running as the tray app, not a headless web host).
        app.MapPost("/api/sessions/source/browse", () =>
        {
            var wpfApp = System.Windows.Application.Current;
            if (wpfApp == null)
                return Results.Problem("native folder picker is unavailable in headless mode", statusCode: 503);

            string? picked = null;
            wpfApp.Dispatcher.Invoke(() =>
            {
                var dlg = new Microsoft.Win32.OpenFolderDialog
                {
                    Title = "Select History Source Folder",
                    InitialDirectory = Directory.Exists(HistoryRoot.Path)
                        ? HistoryRoot.Path
                        : HistoryRoot.DefaultPath,
                };
                if (dlg.ShowDialog() == true)
                    picked = dlg.FolderName;
            });

            return picked == null
                ? Results.NoContent()
                : Results.Ok(new { path = picked });
        });
    }
}

record HistorySourceUpdateRequest(string? Path);

record SettingsUpdateRequest(
    [property: JsonPropertyName("udpListenIp")] string UdpListenIp,
    [property: JsonPropertyName("udpListenPort")] int UdpListenPort,
    [property: JsonPropertyName("webPort")] int WebPort,
    [property: JsonPropertyName("debugMode")] bool DebugMode,
    [property: JsonPropertyName("enableSessionLogging")] bool EnableSessionLogging);

record OpenFolderRequest(string Folder);

record PitTimeUpdateRequest(
    string? TrackName,
    double PitTimeSec);
