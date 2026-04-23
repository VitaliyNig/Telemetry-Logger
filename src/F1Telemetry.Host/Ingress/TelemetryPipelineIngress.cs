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
    private readonly LapTyreStore _lapTyreStore;
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
        LapTyreStore lapTyreStore,
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
        _lapTyreStore = lapTyreStore;
        _sessionLogger = sessionLogger;
        _tracker = tracker;
        _hubContext = hubContext;
        _appSettings = appSettings;
        _logger = logger;
    }

    // Session types where a setup snapshot per lap is relevant (tuning sessions).
    // 1-4 = Practice variants, 18 = Time Trial. See F1 25 UDP spec.
    private static bool IsSetupSnapshotSession(byte sessionType) =>
        sessionType is >= 1 and <= 4 or 18;

    // Packet ids consumed by the web UI (telemetry.js PACKET_HANDLERS). Other ids
    // (Motion, MotionEx, LobbyInfo, LapPositions, FinalClassification) are still
    // deserialized and stored in TelemetryState for /api/state + History mode, but
    // not broadcast live — avoids ~30-50% of SignalR payload volume at 60 Hz.
    private static bool ShouldBroadcastLive(byte packetId) => packetId is
        (byte)F125PacketId.Session
        or (byte)F125PacketId.LapData
        or (byte)F125PacketId.Event
        or (byte)F125PacketId.Participants
        or (byte)F125PacketId.CarSetups
        or (byte)F125PacketId.CarTelemetry
        or (byte)F125PacketId.CarStatus
        or (byte)F125PacketId.CarDamage
        or (byte)F125PacketId.SessionHistory
        or (byte)F125PacketId.TyreSets
        or (byte)F125PacketId.TimeTrial;

    // Debug-panel broadcasts coalesced to ~5 Hz; at 60 Hz × 14 packet types the
    // raw rate would be ~840 Hz and dominate CPU/GC when Debug Mode is on.
    private const long DebugBroadcastMinIntervalTicks = TimeSpan.TicksPerMillisecond * 200;
    private long _lastDebugBroadcastTicks;

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

        var settings = _appSettings.CurrentValue;

        _state.Update(header.PacketId, deserialized);
        if (settings.EnableSessionLogging)
            _sessionLogger.Enqueue(header, header.PacketId, deserialized);

        if (header.PacketId == (byte)F125PacketId.LapData && deserialized is LapDataPacket lapDataPacket)
        {
            var carIdx = header.PlayerCarIndex;
            if (carIdx < lapDataPacket.LapDataItems.Length)
            {
                var currentLapNum = lapDataPacket.LapDataItems[carIdx].CurrentLapNum;
                var sessionType = _state.Get<SessionPacket>((byte)F125PacketId.Session)?.SessionType ?? 0;

                if (IsSetupSnapshotSession(sessionType))
                {
                    var result = _lapSetupStore.OnLapData(
                        header.SessionUid, carIdx, currentLapNum, idx => CaptureSetupSnapshot(idx));

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
                else
                {
                    var result = _lapTyreStore.OnLapData(
                        header.SessionUid, carIdx, currentLapNum, idx => CaptureTyreSnapshot(idx));

                    if (result.HasValue)
                    {
                        try
                        {
                            await _hubContext.Clients.All.ReceiveTyreSnapshot(
                                carIdx, result.Value.LapIndex, result.Value.Snapshot);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to broadcast tyre snapshot");
                        }
                    }
                }
            }
        }

        string? packetName = null;

        if (ShouldBroadcastLive(header.PacketId))
        {
            packetName = F125PacketNames.Get(header.PacketId);
            try
            {
                await _hubContext.Clients.All.ReceivePacket(packetName, header, deserialized);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to broadcast packet {PacketName}", packetName);
            }
        }

        if (settings.DebugMode)
        {
            var nowTicks = DateTime.UtcNow.Ticks;
            var prev = Interlocked.Read(ref _lastDebugBroadcastTicks);
            if (nowTicks - prev >= DebugBroadcastMinIntervalTicks &&
                Interlocked.CompareExchange(ref _lastDebugBroadcastTicks, nowTicks, prev) == prev)
            {
                packetName ??= F125PacketNames.Get(header.PacketId);
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

    private CarSetupData? CaptureSetupSnapshot(byte idx)
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
    }

    private LapTyreSnapshot? CaptureTyreSnapshot(byte idx)
    {
        var status = _state.Get<CarStatusPacket>((byte)F125PacketId.CarStatus);
        var damage = _state.Get<CarDamagePacket>((byte)F125PacketId.CarDamage);
        if (status?.CarStatusDataItems == null || idx >= status.CarStatusDataItems.Length)
            return null;
        var s = status.CarStatusDataItems[idx];
        var wear = (damage?.CarDamageDataItems != null && idx < damage.CarDamageDataItems.Length)
            ? damage.CarDamageDataItems[idx].TyresWear
            : new float[4];
        return new LapTyreSnapshot
        {
            ActualTyreCompound = s.ActualTyreCompound,
            VisualTyreCompound = s.VisualTyreCompound,
            TyresAgeLaps = s.TyresAgeLaps,
            TyresWear = (float[])wear.Clone(),
        };
    }
}
