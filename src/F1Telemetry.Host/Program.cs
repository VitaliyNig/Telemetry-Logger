using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Ingress;
using F1Telemetry.Telemetry;
using F1Telemetry.Udp;

var builder = WebApplication.CreateBuilder(args);

var appSettings = builder.Configuration.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
builder.WebHost.UseUrls($"http://0.0.0.0:{appSettings.WebPort}");

builder.Services.Configure<TelemetryUdpOptions>(
    builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));
builder.Services.Configure<AppSettings>(
    builder.Configuration.GetSection(AppSettings.SectionName));

builder.Services.AddSingleton<IPacketHeaderReader, F125PacketHeaderReader>();
builder.Services.AddSingleton<DebugPacketTracker>();
builder.Services.AddSingleton<ITelemetryIngress, HeaderLoggingTelemetryIngress>();
builder.Services.AddTelemetryUdpListener();
builder.Services.AddSignalR();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<TelemetryHub>("/hub/telemetry");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "f1-telemetry" }));

app.MapGet("/api/info", (IConfiguration config) => Results.Ok(new
{
    game = "F1 25",
    udpAddress = config.GetValue<string>("TelemetryUdp:ListenAddress") ?? "0.0.0.0",
    udpPort = config.GetValue<int?>("TelemetryUdp:Port") ?? 20777,
    webPort = appSettings.WebPort,
    debugMode = appSettings.DebugMode
}));

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
        existing = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object>>(json)
                   ?? new Dictionary<string, object>();
    }

    existing["TelemetryUdp"] = new { ListenAddress = body.UdpListenIp, Port = body.UdpListenPort };
    existing["App"] = new { WebPort = body.WebPort, DebugMode = body.DebugMode };

    var newJson = System.Text.Json.JsonSerializer.Serialize(existing,
        new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
    await File.WriteAllTextAsync(configPath, newJson);

    return Results.Ok(new
    {
        saved = true,
        message = "Settings saved. Web port changes require a restart."
    });
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

app.Run();

record SettingsUpdateRequest(
    string UdpListenIp,
    int UdpListenPort,
    int WebPort,
    bool DebugMode);
