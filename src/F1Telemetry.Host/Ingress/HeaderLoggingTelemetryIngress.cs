using F1Telemetry.F125.Protocol;
using F1Telemetry.Ingress;
using F1Telemetry.Telemetry;
using Microsoft.Extensions.Logging;

namespace F1Telemetry.Host.Ingress;

/// <summary>Minimal ingress: validates F1 25 header layout and logs packet type (placeholder for real pipeline).</summary>
public sealed class HeaderLoggingTelemetryIngress : ITelemetryIngress
{
    private readonly IPacketHeaderReader _headerReader;
    private readonly ILogger<HeaderLoggingTelemetryIngress> _logger;

    public HeaderLoggingTelemetryIngress(
        IPacketHeaderReader headerReader,
        ILogger<HeaderLoggingTelemetryIngress> logger)
    {
        _headerReader = headerReader;
        _logger = logger;
    }

    public Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken)
    {
        var span = packet.Payload.AsSpan();
        if (!_headerReader.TryRead(span, out var header))
        {
            _logger.LogWarning(
                "Short or unknown packet ({Length} bytes) from {Remote}",
                packet.Payload.Length,
                packet.RemoteEndPoint);
            return Task.CompletedTask;
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
        _logger.LogDebug(
            "Packet {PacketId} ({Name}) sessionTime={SessionTime:F3}s frame={Frame}",
            header.PacketId,
            id,
            header.SessionTime,
            header.FrameIdentifier);

        return Task.CompletedTask;
    }
}
