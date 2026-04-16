using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
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
using Microsoft.AspNetCore.StaticFiles;

namespace F1Telemetry;

static class Program
{
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

        builder.Services.Configure<TelemetryUdpOptions>(
            builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));
        builder.Services.Configure<AppSettings>(
            builder.Configuration.GetSection(AppSettings.SectionName));

        builder.Services.AddF125Protocol();
        builder.Services.AddSingleton<TelemetryState>();
        builder.Services.AddSingleton<LapSetupStore>();
        builder.Services.AddSingleton<SessionLogger>();
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
            opts.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(
                new[] { "application/octet-stream" });
        });

        builder.Services.Configure<HostOptions>(o => o.ShutdownTimeout = TimeSpan.FromSeconds(3));

        var app = builder.Build();

        app.Services.GetRequiredService<DebugPacketTracker>().PacketNameResolver = F125PacketNames.Get;

        var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
        lifetime.ApplicationStopping.Register(() =>
            app.Services.GetRequiredService<SessionLogger>().Flush());

        app.UseResponseCompression();
        app.UseDefaultFiles();
        app.UseStaticFiles(new StaticFileOptions
        {
            OnPrepareResponse = ctx =>
            {
                var ext = Path.GetExtension(ctx.File.Name);
                if (ext.Equals(".js", StringComparison.OrdinalIgnoreCase) ||
                    ext.Equals(".css", StringComparison.OrdinalIgnoreCase) ||
                    ext.Equals(".html", StringComparison.OrdinalIgnoreCase))
                {
                    ctx.Context.Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
                    ctx.Context.Response.Headers.Append("Pragma", "no-cache");
                }
            }
        });

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
                LaunchBrowserOnStart = currentApp.LaunchBrowserOnStart
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

        var pitTimesPath = Path.Combine(app.Environment.WebRootPath, "data", "pit-times.json");

        app.MapGet("/api/pit-times", async () =>
        {
            if (!File.Exists(pitTimesPath))
                return Results.Ok(new Dictionary<string, object>());
            var json = await File.ReadAllTextAsync(pitTimesPath);
            var data = JsonSerializer.Deserialize<Dictionary<string, object>>(json);
            return Results.Ok(data);
        });

        app.MapGet("/api/pit-times/{trackId}", async (string trackId) =>
        {
            if (!File.Exists(pitTimesPath))
                return Results.NotFound(new { error = "Pit times file not found" });
            var json = await File.ReadAllTextAsync(pitTimesPath);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty(trackId, out var entry))
                return Results.Ok(JsonSerializer.Deserialize<object>(entry.GetRawText()));
            return Results.NotFound(new { error = $"No pit time for track {trackId}" });
        });

        app.MapPut("/api/pit-times/{trackId}", async (string trackId, HttpContext ctx) =>
        {
            var body = await ctx.Request.ReadFromJsonAsync<PitTimeUpdateRequest>();
            if (body is null || body.PitTimeSec <= 0)
                return Results.BadRequest("Invalid pit time");

            var existing = new Dictionary<string, JsonElement>();
            if (File.Exists(pitTimesPath))
            {
                var json = await File.ReadAllTextAsync(pitTimesPath);
                existing = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json) ?? new();
            }

            var entryJson = JsonSerializer.SerializeToElement(new
            {
                trackName = body.TrackName ?? $"Track {trackId}",
                pitTimeSec = body.PitTimeSec
            });
            existing[trackId] = entryJson;

            var dir = Path.GetDirectoryName(pitTimesPath);
            if (dir != null && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            var newJson = JsonSerializer.Serialize(existing,
                new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(pitTimesPath, newJson);

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
            var logsDir = Path.Combine(AppContext.BaseDirectory, "Logs");
            if (!Directory.Exists(logsDir))
                return Results.Ok(Array.Empty<object>());

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

            return Results.Ok(weekends);
        });

        app.MapPost("/api/sessions/open-folder", (OpenFolderRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Folder))
                return Results.BadRequest(new { error = "folder is required" });

            // Sanitize: only allow folder name, no path traversal
            var safeName = Path.GetFileName(req.Folder);
            var fullPath = Path.Combine(AppContext.BaseDirectory, "Logs", safeName);

            if (!Directory.Exists(fullPath))
                return Results.NotFound(new { error = "folder not found" });

            System.Diagnostics.Process.Start("explorer.exe", fullPath);
            return Results.Ok(new { opened = true });
        });
    }
}

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
