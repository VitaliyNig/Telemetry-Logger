using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using F1Telemetry.Host.Hubs;
using F1Telemetry.Host.Logging;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace F1Telemetry.Host.Ingress;

/// <summary>
/// Full pipeline ingress: reads header, deserializes body, stores state, broadcasts via SignalR,
/// and tracks packets for the debug panel.
/// </summary>
public sealed class TelemetryPipelineIngress : ITelemetryIngress
{
    private readonly IPacketHeaderReader _headerReader;
    private readonly PacketDeserializerRegistry _registry;
    private readonly TelemetryState _state;
    private readonly LapSetupStore _lapSetupStore;
    private readonly SessionLogger _sessionLogger;
    private readonly DebugPacketTracker _tracker;
    private readonly IHubContext<TelemetryHub, ITelemetryClient> _hubContext;
    private readonly IOptionsMonitor<AppSettings> _appSettings;
    private readonly ILogger<TelemetryPipelineIngress> _logger;

    public TelemetryPipelineIngress(
        IPacketHeaderReader headerReader,
        PacketDeserializerRegistry registry,
        TelemetryState state,
        LapSetupStore lapSetupStore,
        SessionLogger sessionLogger,
        DebugPacketTracker tracker,
        IHubContext<TelemetryHub, ITelemetryClient> hubContext,
        IOptionsMonitor<AppSettings> appSettings,
        ILogger<TelemetryPipelineIngress> logger)
    {
        _headerReader = headerReader;
        _registry = registry;
        _state = state;
        _lapSetupStore = lapSetupStore;
        _sessionLogger = sessionLogger;
        _tracker = tracker;
        _hubContext = hubContext;
        _appSettings = appSettings;
        _logger = logger;
    }

    public async Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken)
    {
        var span = packet.Payload.Span;
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

        var packetName = F125PacketNames.Get(header.PacketId);
        _tracker.RecordPacket(header.PacketId);

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
        if (_appSettings.CurrentValue.EnableSessionLogging)
            _sessionLogger.ProcessPacket(header, header.PacketId, deserialized);

        if (header.PacketId == (byte)F125PacketId.LapData && deserialized is LapDataPacket lapDataPacket)
        {
            var carIdx = header.PlayerCarIndex;
            if (carIdx < lapDataPacket.LapDataItems.Length)
            {
                var result = _lapSetupStore.OnLapData(
                    header.SessionUid,
                    carIdx,
                    lapDataPacket.LapDataItems[carIdx].CurrentLapNum,
                    idx =>
                    {
                        var setups = _state.Get<CarSetupsPacket>((byte)F125PacketId.CarSetups);
                        if (setups?.CarSetupData == null || idx >= setups.CarSetupData.Length)
                            return null;
                        var src = setups.CarSetupData[idx];
                        return new CarSetupData
                        {
                            FrontWing = src.FrontWing,
                            RearWing = src.RearWing,
                            OnThrottle = src.OnThrottle,
                            OffThrottle = src.OffThrottle,
                            FrontCamber = src.FrontCamber,
                            RearCamber = src.RearCamber,
                            FrontToe = src.FrontToe,
                            RearToe = src.RearToe,
                            FrontSuspension = src.FrontSuspension,
                            RearSuspension = src.RearSuspension,
                            FrontAntiRollBar = src.FrontAntiRollBar,
                            RearAntiRollBar = src.RearAntiRollBar,
                            FrontSuspensionHeight = src.FrontSuspensionHeight,
                            RearSuspensionHeight = src.RearSuspensionHeight,
                            BrakePressure = src.BrakePressure,
                            BrakeBias = src.BrakeBias,
                            EngineBraking = src.EngineBraking,
                            RearLeftTyrePressure = src.RearLeftTyrePressure,
                            RearRightTyrePressure = src.RearRightTyrePressure,
                            FrontLeftTyrePressure = src.FrontLeftTyrePressure,
                            FrontRightTyrePressure = src.FrontRightTyrePressure,
                            Ballast = src.Ballast,
                            FuelLoad = src.FuelLoad,
                        };
                    });

                if (result.HasValue)
                {
                    try
                    {
                        await _hubContext.Clients.All.ReceiveSetupSnapshot(
                            carIdx, result.Value.LapIndex, result.Value.Setup);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to broadcast setup snapshot");
                    }
                }
            }
        }

        try
        {
            await _hubContext.Clients.All.ReceivePacket(packetName, header, deserialized);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to broadcast packet {PacketName}", packetName);
        }

        if (_appSettings.CurrentValue.DebugMode)
        {
            try
            {
                await _hubContext.Clients.All.DebugPacket(new
                {
                    timestamp = DateTimeOffset.UtcNow.ToString("HH:mm:ss.fff"),
                    name = packetName,
                    counts = _tracker.GetPacketCountsByName(),
                    total = _tracker.TotalPackets
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send debug packet");
            }
        }
    }
}
