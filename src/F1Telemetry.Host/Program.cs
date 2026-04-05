using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Ingress;
using F1Telemetry.Telemetry;
using F1Telemetry.Udp;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<TelemetryUdpOptions>(
    builder.Configuration.GetSection(TelemetryUdpOptions.SectionName));

builder.Services.AddSingleton<IPacketHeaderReader, F125PacketHeaderReader>();
builder.Services.AddSingleton<ITelemetryIngress, HeaderLoggingTelemetryIngress>();
builder.Services.AddTelemetryUdpListener();

var app = builder.Build();

app.MapGet("/api/health", () => Results.Ok(new { status = "ok", service = "f1-telemetry" }));

app.MapGet("/api/info", () => Results.Ok(new
{
    game = "F1 25",
    udpPort = app.Configuration.GetValue<int?>("TelemetryUdp:Port") ?? 20777,
    docs = "See docs/F1 25 Telemetry Output Structures.txt."
}));

app.Run();
