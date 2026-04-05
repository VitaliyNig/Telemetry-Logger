using F1Telemetry.F125.Protocol;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using F1Telemetry.Host.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace F1Telemetry.Host.Ingress;

/// <summary>
/// Full pipeline ingress: reads header, deserializes body, stores state, and broadcasts via SignalR.
/// </summary>
public sealed class TelemetryPipelineIngress : ITelemetryIngress
{
    private readonly IPacketHeaderReader _headerReader;
    private readonly PacketDeserializerRegistry _registry;
    private readonly TelemetryState _state;
    private readonly IHubContext<TelemetryHub, ITelemetryClient> _hubContext;
    private readonly ILogger<TelemetryPipelineIngress> _logger;

    public TelemetryPipelineIngress(
        IPacketHeaderReader headerReader,
        PacketDeserializerRegistry registry,
        TelemetryState state,
        IHubContext<TelemetryHub, ITelemetryClient> hubContext,
        ILogger<TelemetryPipelineIngress> logger)
    {
        _headerReader = headerReader;
        _registry = registry;
        _state = state;
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken)
    {
        var span = packet.Payload.AsSpan();
        if (!_headerReader.TryRead(span, out var header))
        {
            _logger.LogWarning("Short or unknown packet ({Length} bytes) from {Remote}",
                packet.Payload.Length, packet.RemoteEndPoint);
            return;
        }

        if (header.PacketFormat != F125Constants.ExpectedPacketFormat ||
            header.GameYear != F125Constants.ExpectedGameYear)
        {
            _logger.LogWarning("Unexpected format year={Year} format={Format}", header.GameYear, header.PacketFormat);
            return;
        }

        var deserializer = _registry.Get(header.PacketId);
        if (deserializer == null)
        {
            _logger.LogDebug("No deserializer for packet id {PacketId}", header.PacketId);
            return;
        }

        object? deserialized;
        try
        {
            deserialized = deserializer.Deserialize(span, header);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deserialize packet {PacketId}", header.PacketId);
            return;
        }

        if (deserialized == null)
            return;

        _state.Update(header.PacketId, deserialized);

        var packetName = ((F125PacketId)header.PacketId).ToString();
        try
        {
            await _hubContext.Clients.All.ReceivePacket(packetName, header, deserialized);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast packet {PacketName}", packetName);
        }
    }
}
