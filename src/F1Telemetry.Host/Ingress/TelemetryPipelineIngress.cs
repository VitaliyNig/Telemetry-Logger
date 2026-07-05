using F1Telemetry.Config;
using F1Telemetry.Debug;
using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Ingress;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using F1Telemetry.TrackData;
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
    private readonly ProtocolRegistry _protocolRegistry;
    private readonly TelemetryState _state;
    private readonly LapSetupStore _lapSetupStore;
    private readonly LapTyreStore _lapTyreStore;
    private readonly SessionLogger _sessionLogger;
    private readonly DebugPacketTracker _tracker;
    private readonly IngressDiagnosticsTracker _diag;
    private readonly IHubContext<TelemetryHub, ITelemetryClient> _hubContext;
    private readonly IOptionsMonitor<AppSettings> _appSettings;
    private readonly ILogger<TelemetryPipelineIngress> _logger;

    public TelemetryPipelineIngress(
        IPacketHeaderReader headerReader,
        ProtocolRegistry protocolRegistry,
        TelemetryState state,
        LapSetupStore lapSetupStore,
        LapTyreStore lapTyreStore,
        SessionLogger sessionLogger,
        DebugPacketTracker tracker,
        IngressDiagnosticsTracker diag,
        IHubContext<TelemetryHub, ITelemetryClient> hubContext,
        IOptionsMonitor<AppSettings> appSettings,
        ILogger<TelemetryPipelineIngress> logger)
    {
        _headerReader = headerReader;
        _protocolRegistry = protocolRegistry;
        _state = state;
        _lapSetupStore = lapSetupStore;
        _lapTyreStore = lapTyreStore;
        _sessionLogger = sessionLogger;
        _tracker = tracker;
        _diag = diag;
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
    // The byte values are stable across formats 2025 and 2026; CarTelemetry26 (16) is
    // new in 2026 and broadcast live so the Active Aero / Overtake widgets light up.
    private static bool ShouldBroadcastLive(byte packetId) => packetId is
        (byte)F1PacketId.Session
        or (byte)F1PacketId.LapData
        or (byte)F1PacketId.Event
        or (byte)F1PacketId.Participants
        or (byte)F1PacketId.CarSetups
        or (byte)F1PacketId.CarTelemetry25
        or (byte)F1PacketId.CarStatus
        or (byte)F1PacketId.CarDamage
        or (byte)F1PacketId.SessionHistory
        or (byte)F1PacketId.TyreSets
        or (byte)F1PacketId.TimeTrial
        or 16; // CarTelemetry26 — format 2026 only

    // Debug-panel broadcasts coalesced to ~5 Hz; at 60 Hz × 14 packet types the
    // raw rate would be ~840 Hz and dominate CPU/GC when Debug Mode is on.
    private const long DebugBroadcastMinIntervalTicks = TimeSpan.TicksPerMillisecond * 200;
    private long _lastDebugBroadcastTicks;

    // Live Track Map car positions, coalesced to ~10 Hz. Motion is 60 Hz and its full
    // payload is deliberately excluded from ShouldBroadcastLive; the widget only needs
    // [x,y,z] per car, so this compact side-channel costs ~1/40 of a raw Motion stream.
    private const long CarPositionsMinIntervalTicks = TimeSpan.TicksPerMillisecond * 100;
    private long _lastCarPositionsTicks;

    /// <summary>
    /// Fire-and-forget a SignalR broadcast so the UDP receive loop never blocks on it.
    /// Even with zero clients the awaited call can yield (arg boxing, internal scheduling,
    /// cold JIT paths), and the UDP listener is strictly serial — any latency here translates
    /// directly into kernel SO_RCVBUF overflow and silent datagram loss. Exceptions are
    /// captured + logged so they don't disappear into the void like a naked discard would.
    /// </summary>
    private void FireAndForgetBroadcast(Task task, string what)
    {
        if (task.IsCompletedSuccessfully) return; // hot path: SignalR returned synchronously.
        _ = task.ContinueWith(
            t =>
            {
                if (t.Exception != null)
                    _logger.LogError(t.Exception, "SignalR broadcast failed: {What}", what);
            },
            CancellationToken.None,
            TaskContinuationOptions.OnlyOnFaulted | TaskContinuationOptions.ExecuteSynchronously,
            TaskScheduler.Default);
    }

    // No more await on the hot path: SignalR broadcasts are now fire-and-forget
    // (see FireAndForgetBroadcast) and the DRS-zone save was already offloaded via
    // Task.Run. Returning Task.CompletedTask directly avoids the async state machine
    // allocation per packet (~120 bytes × 840 Hz = ~100 KB/s of GC churn eliminated).
    public Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken)
    {
        var span = packet.Payload.Span;
        if (!_headerReader.TryRead(span, out var header))
        {
            _diag.RecordHeaderFailedUnknownId();
            _logger.LogWarning("Short or unknown packet ({Length} bytes) from {Remote}",
                packet.Payload.Length, packet.RemoteEndPoint);
            return Task.CompletedTask;
        }

        _diag.RecordReceived(header.PacketId, header.SessionTime);

        // Dispatch by m_packetFormat: pick the protocol plugin (2025, 2026, future 2027 …)
        // that owns this format. m_gameYear is intentionally NOT checked — the user may run
        // any DLC / season pack that bumps the year while keeping the format stable.
        var plugin = _protocolRegistry.Get(header.PacketFormat);
        if (plugin == null)
        {
            _diag.RecordFormatMismatch(header.PacketId);
            _logger.LogWarning(
                "No protocol plugin for packetFormat={Format} (gameYear={Year}); install or register the matching format module.",
                header.PacketFormat, header.GameYear);
            return Task.CompletedTask;
        }

        _tracker.RecordPacket(header.PacketId);

        var deserializer = plugin.GetDeserializer(header.PacketId);
        if (deserializer == null)
        {
            _diag.RecordNoDeserializer(header.PacketId);
            _logger.LogDebug("No deserializer for packet id {PacketId} in format {Format}",
                header.PacketId, plugin.PacketFormat);
            return Task.CompletedTask;
        }

        object? deserialized;
        try
        {
            deserialized = deserializer.Deserialize(span, header);
        }
        catch (Exception ex)
        {
            _diag.RecordDeserializerThrew(header.PacketId);
            _logger.LogError(ex, "Failed to deserialize packet {PacketId}", header.PacketId);
            return Task.CompletedTask;
        }

        if (deserialized == null)
        {
            _diag.RecordDeserializerNull(header.PacketId);
            return Task.CompletedTask;
        }

        var settings = _appSettings.CurrentValue;

        _state.Update(header.PacketId, deserialized);
        if (settings.EnableSessionLogging)
        {
            _sessionLogger.Enqueue(header, header.PacketId, deserialized);
            _diag.RecordEnqueued(header.PacketId);
        }

        if (header.PacketId == (byte)F1PacketId.LapData && deserialized is LapDataPacket lapDataPacket)
        {
            var carIdx = header.PlayerCarIndex;
            if (carIdx < lapDataPacket.LapDataItems.Length)
            {
                var playerLap = lapDataPacket.LapDataItems[carIdx];
                var currentLapNum = playerLap.CurrentLapNum;
                var session = _state.Get<SessionPacket>((byte)F1PacketId.Session);
                var sessionType = session?.SessionType ?? 0;

                if (IsSetupSnapshotSession(sessionType))
                {
                    var result = _lapSetupStore.OnLapData(
                        header.SessionUid, carIdx, currentLapNum, idx => CaptureSetupSnapshot(idx));

                    if (result.HasValue)
                    {
                        FireAndForgetBroadcast(
                            _hubContext.Clients.All.ReceiveSetupSnapshot(
                                carIdx, result.Value.LapIndex, result.Value.Setup),
                            "setup snapshot");
                    }
                }
                else
                {
                    var result = _lapTyreStore.OnLapData(
                        header.SessionUid, carIdx, currentLapNum, idx => CaptureTyreSnapshot(idx));

                    if (result.HasValue)
                    {
                        FireAndForgetBroadcast(
                            _hubContext.Clients.All.ReceiveTyreSnapshot(
                                carIdx, result.Value.LapIndex, result.Value.Snapshot),
                            "tyre snapshot");
                    }
                }
            }
        }

        if (header.PacketId == (byte)F1PacketId.Motion && deserialized is MotionPacket motionPacket)
        {
            var nowTicks = DateTime.UtcNow.Ticks;
            var prev = Interlocked.Read(ref _lastCarPositionsTicks);
            if (nowTicks - prev >= CarPositionsMinIntervalTicks &&
                Interlocked.CompareExchange(ref _lastCarPositionsTicks, nowTicks, prev) == prev)
            {
                var cars = motionPacket.CarMotionData;
                var positions = new float[cars.Length][];
                for (var i = 0; i < cars.Length; i++)
                    positions[i] = [cars[i].WorldPositionX, cars[i].WorldPositionY, cars[i].WorldPositionZ];
                FireAndForgetBroadcast(
                    _hubContext.Clients.All.ReceiveCarPositions(positions),
                    "car positions");
            }
        }

        string? packetName = null;

        if (ShouldBroadcastLive(header.PacketId))
        {
            packetName = plugin.GetPacketName(header.PacketId);
            FireAndForgetBroadcast(
                _hubContext.Clients.All.ReceivePacket(packetName, header, deserialized),
                packetName);
        }

        if (settings.DebugMode)
        {
            var nowTicks = DateTime.UtcNow.Ticks;
            var prev = Interlocked.Read(ref _lastDebugBroadcastTicks);
            if (nowTicks - prev >= DebugBroadcastMinIntervalTicks &&
                Interlocked.CompareExchange(ref _lastDebugBroadcastTicks, nowTicks, prev) == prev)
            {
                packetName ??= plugin.GetPacketName(header.PacketId);
                FireAndForgetBroadcast(
                    _hubContext.Clients.All.DebugPacket(new
                    {
                        timestamp = DateTimeOffset.UtcNow.ToString("HH:mm:ss.fff"),
                        name = packetName,
                        counts = _tracker.GetPacketCountsByName(),
                        total = _tracker.TotalPackets,
                    }),
                    "debug packet");
            }
        }

        return Task.CompletedTask;
    }

    private CarSetupData? CaptureSetupSnapshot(byte idx)
    {
        var setups = _state.Get<CarSetupsPacket>((byte)F1PacketId.CarSetups);
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
        var status = _state.Get<CarStatusPacket>((byte)F1PacketId.CarStatus);
        var damage = _state.Get<CarDamagePacket>((byte)F1PacketId.CarDamage);
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
