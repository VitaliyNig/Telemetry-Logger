using System.IO;
using System.Text.Json;
using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Host.Serialization;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.Tray;
using F1Telemetry.Udp;
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

        var appSettings = builder.Configuration.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
        builder.WebHost.UseUrls($"http://0.0.0.0:{appSettings.WebPort}");

        builder.Services.Configure<TelemetryUdpOptions>(
            builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));
        builder.Services.Configure<AppSettings>(
            builder.Configuration.GetSection(AppSettings.SectionName));

        builder.Services.AddF125Protocol();
        builder.Services.AddSingleton<TelemetryState>();
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
            json.Converters.Add(new FiniteSingleJsonConverter());
            json.Converters.Add(new FiniteDoubleJsonConverter());
        });

        var app = builder.Build();

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
            packetTypes = Enum.GetNames<F125PacketId>()
        }));

        app.MapGet("/api/state", (TelemetryState state) =>
        {
            var all = state.GetAll();
            var result = new Dictionary<string, object>();
            foreach (var (key, value) in all)
            {
                var name = ((F125PacketId)key).ToString();
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

        app.MapGet("/api/settings", (IConfiguration config) =>
        {
            var udpSection = config.GetSection("TelemetryUdp");
            var appSection = config.GetSection("App");
            return Results.Ok(new
            {
                udpListenIp = udpSection.GetValue<string>("ListenAddress") ?? "0.0.0.0",
                udpListenPort = udpSection.GetValue<int?>("Port") ?? 20777,
                webPort = appSection.GetValue<int?>("WebPort") ?? 5000,
                debugMode = appSection.GetValue<bool?>("DebugMode") ?? false
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
                counts = tracker.GetPacketCounts()
            });
        });

        app.MapGet("/api/debug/log", (DebugPacketTracker tracker) =>
        {
            var entries = tracker.GetRecentEntries();
            return Results.Ok(entries.Select(e => new
            {
                timestamp = e.Timestamp.ToString("HH:mm:ss.fff"),
                name = e.PacketName
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
    }
}

record SettingsUpdateRequest(
    string UdpListenIp,
    int UdpListenPort,
    int WebPort,
    bool DebugMode);

record PitTimeUpdateRequest(
    string? TrackName,
    double PitTimeSec);
