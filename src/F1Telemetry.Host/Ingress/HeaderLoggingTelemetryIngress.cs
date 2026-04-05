using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Ingress;
using F1Telemetry.Telemetry;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace F1Telemetry.Host.Ingress;

public sealed class HeaderLoggingTelemetryIngress : ITelemetryIngress
{
    private readonly IPacketHeaderReader _headerReader;
    private readonly ILogger<HeaderLoggingTelemetryIngress> _logger;
    private readonly DebugPacketTracker _tracker;
    private readonly IHubContext<TelemetryHub> _hubContext;
    private readonly IOptionsMonitor<AppSettings> _appSettings;

    public HeaderLoggingTelemetryIngress(
        IPacketHeaderReader headerReader,
        ILogger<HeaderLoggingTelemetryIngress> logger,
        DebugPacketTracker tracker,
        IHubContext<TelemetryHub> hubContext,
        IOptionsMonitor<AppSettings> appSettings)
    {
        _headerReader = headerReader;
        _logger = logger;
        _tracker = tracker;
        _hubContext = hubContext;
        _appSettings = appSettings;
    }

    public async Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken)
    {
        var span = packet.Payload.AsSpan();
        if (!_headerReader.TryRead(span, out var header))
        {
            _logger.LogWarning(
                "Short or unknown packet ({Length} bytes) from {Remote}",
                packet.Payload.Length,
                packet.RemoteEndPoint);
            return;
        }

        if (header.PacketFormat != F125Constants.ExpectedPacketFormat || header.GameYear != F125Constants.ExpectedGameYear)
        {
            _logger.LogWarning(
                "Unexpected format year={Year} format={Format} (expected F1 {ExpectedYear} / {ExpectedFormat})",
                header.GameYear,
                header.PacketFormat,
                F125Constants.ExpectedGameYear,
                F125Constants.ExpectedPacketFormat);
        }

        var id = (F125PacketId)header.PacketId;
        var packetName = id.ToString();

        _logger.LogDebug(
            "Packet {PacketId} ({Name}) sessionTime={SessionTime:F3}s frame={Frame}",
            header.PacketId,
            packetName,
            header.SessionTime,
            header.FrameIdentifier);

        _tracker.RecordPacket(packetName);

        if (_appSettings.CurrentValue.DebugMode)
        {
            await _hubContext.Clients.All.SendAsync("DebugPacket", new
            {
                timestamp = DateTimeOffset.UtcNow.ToString("HH:mm:ss.fff"),
                name = packetName,
                counts = _tracker.GetPacketCounts(),
                total = _tracker.TotalPackets
            }, cancellationToken);
        }
    }
}
