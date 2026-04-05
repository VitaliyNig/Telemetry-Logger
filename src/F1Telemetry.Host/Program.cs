using F1Telemetry.F125;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.Udp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<TelemetryUdpOptions>(
    builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));

builder.Services.AddF125Protocol();
builder.Services.AddSingleton<TelemetryState>();
builder.Services.AddSingleton<ITelemetryIngress, TelemetryPipelineIngress>();
builder.Services.AddTelemetryUdpListener();
builder.Services.AddSignalR()
    .AddJsonProtocol(options =>
    {
        options.PayloadSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase;
    });

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<TelemetryHub>("/hub/telemetry");

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "f1-telemetry" }));

app.MapGet("/api/info", () => Results.Ok(new
{
    game = "F1 25",
    udpPort = app.Configuration.GetValue<int?>("TelemetryUdp:Port") ?? 20777,
    docs = "See docs/F1 25 Telemetry Output Structures.txt.",
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

app.Run();
