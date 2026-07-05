using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Host.Ingress;
using F1Telemetry.Host.Serialization;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using F1Telemetry.TrackData;
using Microsoft.Extensions.Logging;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Accumulates telemetry data per session and writes schema-v2 JSON files to Logs/.
/// For every completed lap of every car it keeps a 20 Hz telemetry sample stream and a 10 Hz
/// motion trace; samples live in-memory for the current lap only and are committed to the
/// per-car Laps list at lap completion. Sessions belonging to the same weekend
/// (WeekendLinkIdentifier) share a folder.
/// </summary>
public sealed class SessionLogger
{
    private readonly LapSetupStore _lapSetupStore;
    private readonly IngressDiagnosticsTracker _ingressDiag;
    private readonly ProtocolRegistry _registry;
    private readonly TrackGeometryZoneStore _zoneStore;
    private readonly ILogger<SessionLogger> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    // Sampling gates (seconds): packets arrive at 60 Hz; we accept a sample if at least this
    // long has passed since the last recorded one for the given car.
    private const float TelemetryGateS = 0.05f; // 20 Hz
    private const float MotionGateS = 0.10f;    // 10 Hz

    /// <summary>
    /// Upper bound on car slots. Format 2025 emits 22, format 2026 emits 24; future formats
    /// will push this further. Allocating to the upper bound lets the logger handle both
    /// formats without per-session sizing — slots that are unused for a given session simply
    /// stay default and never appear in the saved JSON (the loops in
    /// <see cref="SampleTelemetry"/> / <see cref="SampleMotion"/> cap at the packet's actual
    /// car-array length).
    /// </summary>
    private const int MaxCars = 24;

    // Periodic checkpoint cadence: every N completed laps of the player car we rewrite the
    // session JSON so a crash only loses the tail of a session, not the whole thing.
    // Schema v3 checkpoints only the compact main file (samples live in the append-only
    // sidecar), so every player lap is affordable — v2 rewrote the whole 100 MB+ log and
    // had to settle for every 5th.
    private const int FlushEveryNPlayerLaps = 1;

    private readonly object _lock = new();

    /// <summary>All accumulated sessions keyed by sessionUid. Entries stay in the map after
    /// SEND (marked <see cref="SessionEntry.Finalized"/>) so late packets can still merge in —
    /// in single player the FinalClassification packet arrives AFTER SEND (observed in real
    /// logs: races saved by the pre-fix code have no classification at all).</summary>
    private readonly Dictionary<ulong, SessionEntry> _sessions = new();

    /// <summary>Weekend folder names keyed by weekendLinkId.</summary>
    private readonly Dictionary<uint, string> _weekendFolders = new();

    private ulong _currentSessionUid;

    /// <summary>
    /// Envelope queued from the UDP thread and drained by <see cref="SessionLoggerWriter"/>.
    /// Using a channel decouples JSON work + list growth from the hot ingress path so SignalR
    /// broadcasts don't pay the sampling / flush cost.
    /// </summary>
    internal readonly record struct LoggerEnvelope(TelemetryPacketHeader Header, byte PacketId, object Data);

    // Bounded-capacity channel with DropOldest when full: at 60 Hz × 14 packet types we'd enqueue
    // ~840 msg/s, well under 16k. A backlog that hits the cap means the writer is pathologically
    // behind (disk issue) and dropping the oldest motion packets is preferable to unbounded growth.
    private readonly Channel<LoggerEnvelope> _queue = Channel.CreateBounded<LoggerEnvelope>(
        new BoundedChannelOptions(16_384)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });

    internal ChannelReader<LoggerEnvelope> Reader => _queue.Reader;

    public SessionLogger(
        LapSetupStore lapSetupStore,
        IngressDiagnosticsTracker ingressDiag,
        ProtocolRegistry registry,
        TrackGeometryZoneStore zoneStore,
        ILogger<SessionLogger> logger)
    {
        _lapSetupStore = lapSetupStore;
        _ingressDiag = ingressDiag;
        _registry = registry;
        _zoneStore = zoneStore;
        _logger = logger;
    }

    /// <summary>Per-session plugin: picks the format-appropriate lookups; null only when no plugins registered.</summary>
    private IProtocolPlugin? GetPlugin(SessionEntry entry) =>
        _registry.GetOrFallback(entry.PacketFormat == 0 ? (ushort)2025 : entry.PacketFormat);

    /// <summary>Packet-name resolver that walks all registered plugins; falls back to the byte if nothing matches.</summary>
    private string ResolvePacketName(byte packetId)
    {
        foreach (var p in _registry.All)
        {
            var name = p.GetPacketName(packetId);
            // Plugins return either the enum name (e.g. "CarTelemetry25") or the numeric byte
            // for unknown ids — accept the first non-numeric result.
            if (!byte.TryParse(name, out _)) return name;
        }
        return packetId.ToString();
    }

    /// <summary>
    /// Called from the UDP / ingress thread. Non-blocking: pushes the packet to an internal channel
    /// which <see cref="SessionLoggerWriter"/> drains on a dedicated task.
    /// </summary>
    private int _droppedEnqueueCount;

    public void Enqueue(TelemetryPacketHeader header, byte packetId, object data)
    {
        if (_queue.Writer.TryWrite(new LoggerEnvelope(header, packetId, data)))
            return;

        var dropped = Interlocked.Increment(ref _droppedEnqueueCount);
        if (dropped == 1 || dropped % 1000 == 0)
        {
            _logger.LogWarning(
                "Session logger queue is full; dropped {Dropped} packets so far.",
                dropped);
        }
    }

    public void ProcessPacket(TelemetryPacketHeader header, byte packetId, object data)
    {
        lock (_lock)
        {
            var uid = header.SessionUid;
            _currentSessionUid = uid;

            if (!_sessions.TryGetValue(uid, out var entry))
            {
                entry = new SessionEntry();
                Array.Fill(entry.DiagPerTypeFirstSessionTimeS, -1f);
                _sessions[uid] = entry;
            }

            // A finalized (post-SEND) session only accepts the packets that legitimately
            // arrive after SEND in single player: FinalClassification (the authoritative
            // result — observed to follow SEND) and SessionHistory (final bulk update).
            // Everything else (Session snapshots on the results screen, stray telemetry)
            // is ignored so it can't dilute the finished log before the rewrite.
            if (entry.Finalized)
            {
                // "Restart Session" after a finished race can reuse the sessionUID. SSTA on a
                // finalized entry means a new attempt is starting — begin a fresh entry (the
                // finished log was already written; the retake overwrites the same slug, which
                // matches the game's own "restart discards the old result" semantics).
                if (data is EventPacket { EventCode: "SSTA" })
                {
                    _logger.LogInformation("Session {Uid} restarted after SEND — starting a fresh entry.", uid);
                    entry = new SessionEntry();
                    Array.Fill(entry.DiagPerTypeFirstSessionTimeS, -1f);
                    _sessions[uid] = entry;
                    // Fall through to normal processing so the SSTA event itself is recorded.
                }
                else
                {
                    switch (data)
                    {
                        case FinalClassificationPacket lateCls:
                            entry.LatestFinalClassification = lateCls;
                            entry.LatestPackets[ResolvePacketName(packetId)] = data;
                            FinalizeAndWrite(entry, uid, entry.LastKnownSessionTimeS);
                            break;
                        case SessionHistoryPacket lateHistory:
                            entry.LapHistories[lateHistory.CarIdx] = lateHistory;
                            // No write per packet (bulk update is a 20 Hz burst); the idle
                            // checkpoint picks the merged data up once the burst ends.
                            entry.LastPacketAtUtc = DateTime.UtcNow;
                            entry.IdleCheckpointWritten = false;
                            break;
                    }
                    return;
                }
            }

            entry.PlayerCarIndex = header.PlayerCarIndex;
            entry.GameYear = header.GameYear;
            entry.PacketFormat = header.PacketFormat;
            entry.LastKnownSessionTimeS = header.SessionTime;
            entry.LastPacketAtUtc = DateTime.UtcNow;
            entry.IdleCheckpointWritten = false;

            // Per-entry per-type seen counter (lives next to LatestPackets so we can tell
            // whether a packet type ever reached *this* SessionUid even if it never made it
            // to a sampler. Bounds-check is cheap; the array is size 64 (>F125 max id).
            if (packetId < entry.DiagPerTypeSeen.Length)
            {
                entry.DiagPerTypeSeen[packetId]++;
                if (entry.DiagPerTypeFirstSessionTimeS[packetId] < 0f)
                    entry.DiagPerTypeFirstSessionTimeS[packetId] = header.SessionTime;
            }

            // Update latest snapshot for every non-high-frequency packet. Motion / MotionEx
            // would otherwise balloon the in-memory snapshot dictionary. Ids 0 (Motion) and
            // 13 (MotionEx) are stable across formats 2025 and 2026.
            const byte MotionId = 0;
            const byte MotionExId = 13;
            if (packetId != MotionId && packetId != MotionExId)
            {
                var name = ResolvePacketName(packetId);
                entry.LatestPackets[name] = data;
            }

            switch (data)
            {
                case SessionPacket session:
                    entry.SessionType = session.SessionType;
                    ResolveWeekendFolder(entry, session);
                    UpdateRaceFlag(entry, session);
                    break;
                case SessionHistoryPacket history:
                    entry.LapHistories[history.CarIdx] = history;
                    break;
                case EventPacket evt:
                    HandleEvent(entry, header, evt);
                    if (evt.EventCode == "FLBK")
                    {
                        HandleFlashback(entry, header, evt);
                    }
                    if (evt.EventCode == "SSTA")
                    {
                        // "Restart Session" is a timeline rewind without a FLBK event: lap
                        // numbers drop back to 1 and OverallFrameIdentifier restarts. Without
                        // this reset the OFI gate silently drops all telemetry until the frame
                        // counter catches up to its pre-restart value, and the first LapData
                        // "completes" a bogus lap exactly like an unhandled flashback would.
                        // On a genuinely fresh session the reset is a no-op.
                        ResetLapTracking(entry, header.SessionTime);
                        // A restart always begins under green; the sticky Red latch would
                        // otherwise survive into the retake (LGOT only clears it in races).
                        entry.CurrentRaceFlag = RaceFlag.Green;
                    }
                    if (evt.EventCode == "SEND")
                    {
                        FinalizeAndWrite(entry, uid, header.SessionTime);
                        // Keep the entry: FinalClassification arrives after SEND in single
                        // player and must still merge in (see the Finalized branch above).
                        entry.Finalized = true;
                        entry.IdleCheckpointWritten = true; // just written; late packets re-arm it
                        return;
                    }
                    break;
                case FinalClassificationPacket classification:
                    entry.LatestFinalClassification = classification;
                    // Authoritative "session over" signal — by now the game has also sent the
                    // final SessionHistory bulk update for all cars. Finalize and write
                    // immediately instead of waiting for SEND: if the player Alt+F4s the game
                    // from the results screen, SEND never arrives and the rescue laps of cars
                    // that finished after the player would otherwise sit in RAM until app
                    // shutdown. The entry stays alive so a later SEND re-finalizes with any
                    // updates that arrive in between.
                    FinalizeAndWrite(entry, uid, header.SessionTime);
                    break;
                case CarTelemetry25Packet telemetry:
                    SampleTelemetry(entry, header, telemetry);
                    break;
                case MotionPacket motion:
                    SampleMotion(entry, header, motion);
                    break;
                case LapDataPacket lapData:
                    ProcessLapData(entry, header, lapData);
                    break;
                case CarStatusPacket carStatus:
                    LatchBlueFlags(entry, carStatus);
                    break;
                case ParticipantsPacket participants:
                    UpdateDriverLiveryColors(entry, participants);
                    break;
            }
        }
    }

    private void SampleTelemetry(SessionEntry entry, TelemetryPacketHeader header, CarTelemetry25Packet packet)
    {
        if (!ShouldAcceptFrame(entry, header))
        {
            entry.DiagTelemetryRejectedOfi++;
            if (!entry.DiagLoggedFirstTelemetryReject)
            {
                entry.DiagLoggedFirstTelemetryReject = true;
                _logger.LogWarning(
                    "[diag] First CarTelemetry25 rejected by OFI gate: ofi={Ofi} last={Last} sessionT={T:F2}s",
                    header.OverallFrameIdentifier, entry.LastOverallFrameIdentifierProcessed, header.SessionTime);
            }
            return;
        }

        var lapPacket = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;
        if (lapPacket == null)
        {
            entry.DiagTelemetryRejectedNoLapData++;
            return;
        }
        var statusPacket = entry.LatestPackets.GetValueOrDefault("CarStatus") as CarStatusPacket;
        // Format 2026+ ships Active Aero state in the separate CarTelemetry26 packet (id 16).
        // Null in 2025 sessions, in which case Aero stays 0 (Corner mode) and the Perf metric
        // uses DRS instead.
        var aeroPacket = entry.LatestPackets.GetValueOrDefault("CarTelemetry26") as CarTelemetry26Packet;

        var count = Math.Min(packet.CarTelemetry25Data.Length, Math.Min(lapPacket.LapDataItems.Length, MaxCars));
        for (byte idx = 0; idx < count; idx++)
        {
            if (header.SessionTime - entry.LastTelemetryTickS[idx] < TelemetryGateS)
            {
                entry.DiagTelemetryGated20Hz++;
                continue;
            }
            entry.LastTelemetryTickS[idx] = header.SessionTime;
            if (entry.DiagTelemetryAccepted == 0 && entry.DiagFirstTelemetryAcceptedAtS < 0f)
                entry.DiagFirstTelemetryAcceptedAtS = header.SessionTime;
            entry.DiagTelemetryAccepted++;

            var t = packet.CarTelemetry25Data[idx];
            var l = lapPacket.LapDataItems[idx];
            var s = (statusPacket != null && idx < statusPacket.CarStatusDataItems.Length)
                ? statusPacket.CarStatusDataItems[idx]
                : null;

            var buf = entry.CurrentLapSamples[idx] ??= new List<LapSample>(256);
            buf.Add(new LapSample
            {
                T = header.SessionTime - entry.CurrentLapStartSessionTimeS[idx],
                D = l.LapDistance,
                Spd = t.Speed,
                Thr = (byte)Math.Clamp((int)MathF.Round(t.Throttle * 100f), 0, 100),
                Brk = (byte)Math.Clamp((int)MathF.Round(t.Brake * 100f), 0, 100),
                Str = (sbyte)Math.Clamp((int)MathF.Round(t.Steer * 100f), -100, 100),
                Gr = t.Gear,
                Rpm = t.EngineRpm,
                Sec = l.Sector,
                Ers = s == null ? (byte)0 : (byte)Math.Clamp((int)MathF.Round(s.ErsStoreEnergy / 4_000_000f * 100f), 0, 100),
                ErsMd = s?.ErsDeployMode ?? (byte)0,
                Drs = t.Drs,
                DrsAllowed = s?.DrsAllowed ?? (byte)0,
                Aero = (aeroPacket != null && idx < aeroPacket.CarTelemetry26DataItems.Length)
                    ? aeroPacket.CarTelemetry26DataItems[idx].ActiveAeroMode
                    : (byte)0,
                Ovt = (aeroPacket != null && idx < aeroPacket.CarTelemetry26DataItems.Length)
                    ? aeroPacket.CarTelemetry26DataItems[idx].OvertakeActive
                    : (byte)0,
                ErsDepLapJ = s?.ErsDeployedThisLap ?? 0f,
                // K+H combined harvest; HarvLimJ is 0 in 2025 logs (field doesn't exist in format 2025).
                HarvJ = s == null ? 0f : (s.ErsHarvestedThisLapMguK + s.ErsHarvestedThisLapMguH),
                HarvLimJ = s?.ErsHarvestLimitPerLap ?? 0f,
            });
        }
    }

    private void SampleMotion(SessionEntry entry, TelemetryPacketHeader header, MotionPacket packet)
    {
        if (!ShouldAcceptFrame(entry, header))
        {
            entry.DiagMotionRejectedOfi++;
            if (!entry.DiagLoggedFirstMotionReject)
            {
                entry.DiagLoggedFirstMotionReject = true;
                _logger.LogWarning(
                    "[diag] First Motion rejected by OFI gate: ofi={Ofi} last={Last} sessionT={T:F2}s",
                    header.OverallFrameIdentifier, entry.LastOverallFrameIdentifierProcessed, header.SessionTime);
            }
            return;
        }

        var lapPacket = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;
        if (lapPacket == null)
        {
            entry.DiagMotionRejectedNoLapData++;
            return;
        }

        var count = Math.Min(packet.CarMotionData.Length, Math.Min(lapPacket.LapDataItems.Length, MaxCars));
        for (byte idx = 0; idx < count; idx++)
        {
            if (header.SessionTime - entry.LastMotionTickS[idx] < MotionGateS)
            {
                entry.DiagMotionGated10Hz++;
                continue;
            }
            entry.LastMotionTickS[idx] = header.SessionTime;
            if (entry.DiagMotionAccepted == 0 && entry.DiagFirstMotionAcceptedAtS < 0f)
                entry.DiagFirstMotionAcceptedAtS = header.SessionTime;
            entry.DiagMotionAccepted++;

            var m = packet.CarMotionData[idx];
            var l = lapPacket.LapDataItems[idx];

            var buf = entry.CurrentLapMotion[idx] ??= new List<MotionSample>(128);
            buf.Add(new MotionSample
            {
                T = header.SessionTime - entry.CurrentLapStartSessionTimeS[idx],
                D = l.LapDistance,
                X = m.WorldPositionX,
                Y = m.WorldPositionY,
                Z = m.WorldPositionZ,
            });
        }
    }

    private void ProcessLapData(SessionEntry entry, TelemetryPacketHeader header, LapDataPacket packet)
    {
        var sessionPacket = entry.LatestPackets.GetValueOrDefault("Session") as SessionPacket;
        var trackLenM = sessionPacket?.TrackLength ?? 0;
        var count = Math.Min(packet.LapDataItems.Length, MaxCars);
        for (byte idx = 0; idx < count; idx++)
        {
            var lap = packet.LapDataItems[idx];

            // Track the highest race-control flag the car saw during this lap.
            if (entry.CurrentRaceFlag > entry.LapMaxFlag[idx])
                entry.LapMaxFlag[idx] = entry.CurrentRaceFlag;
            // Latch formation-lap presence for this car — driven by SessionPacket's m_safetyCarStatus == 3.
            if (entry.IsFormationLap)
                entry.WasFormationLap[idx] = true;

            var currentNum = lap.CurrentLapNum;
            var prevNum = entry.CurrentLapNum[idx];
            var currentDist = lap.LapDistance;
            var prevDist = entry.PrevLapDistance[idx];
            entry.PrevLapDistance[idx] = currentDist;

            var currentPitStatus = lap.PitStatus;
            var prevPitStatus = entry.PrevPitStatus[idx];
            entry.PrevPitStatus[idx] = currentPitStatus;

            if (prevNum == 0)
            {
                // First time we see this car — anchor the lap start.
                entry.CurrentLapNum[idx] = currentNum;
                entry.CurrentLapStartSessionTimeS[idx] = header.SessionTime - lap.CurrentLapTimeInMs / 1000f;
                continue;
            }

            if (currentNum != prevNum)
            {
                // Lap boundary crossed — the lap we just left (prevNum) is now complete.
                CompleteLap(entry, idx, prevNum, lap, header.SessionUid);
                entry.CurrentLapNum[idx] = currentNum;
                entry.CurrentLapStartSessionTimeS[idx] = header.SessionTime;
                entry.LapMaxFlag[idx] = entry.CurrentRaceFlag;
                entry.WasFormationLap[idx] = false;
                continue;
            }

            // Non-race sessions (practice / quali / sprint shootout / time trial): the game keeps
            // m_currentLapNum unchanged across pit-out → out-lap → S/F → flying lap and only ticks
            // it when a TIMED lap finishes. Without this branch, all pre-lap samples (pit-sit +
            // out-lap, or cool-down between push attempts) get folded into the saved flying lap.
            // Detect the uncounted S/F crossing via PitStatus / lapDistance and reset the sample
            // buffer so the saved lap only carries the push-lap segment.
            //
            // Skip for race-like sessions (race / race2 / race3 — IDs 15/16/17 per ProtocolLookups.SessionTypes):
            // they tick m_currentLapNum at every S/F crossing, so the boundaryByNum block above
            // handles them. Firing here would also wipe in-lap pre-pit samples on regular pit stops.
            if (!IsRaceLikeSession(entry.SessionType))
            {
                bool wrapBack = trackLenM > 0
                    && prevDist > trackLenM * 0.9f
                    && currentDist >= 0
                    && currentDist < trackLenM * 0.1f;
                bool pitExitCrossing = (prevPitStatus != 0 && currentPitStatus == 0) || (prevDist < 0 && currentDist >= 0);
                if (wrapBack || pitExitCrossing)
                {
                    entry.CurrentLapSamples[idx] = null;
                    entry.CurrentLapMotion[idx] = null;
                    entry.CurrentLapStartSessionTimeS[idx] = header.SessionTime;
                    entry.LapMaxFlag[idx] = entry.CurrentRaceFlag;
                    entry.WasFormationLap[idx] = false;
                    entry.LapBlueFlag[idx] = false;
                }
            }
        }
    }

    /// <summary>Race / Race 2 / Race 3 per ProtocolLookups.SessionTypes. These sessions tick m_currentLapNum
    /// at every S/F crossing, so they don't need (and shouldn't have) the non-race buffer reset
    /// that handles uncounted out-lap → flying-lap transitions.</summary>
    private static bool IsRaceLikeSession(byte sessionType) =>
        sessionType is 15 or 16 or 17;

    /// <param name="staleLapData"><c>latest</c> is a frozen snapshot from before this lap
    /// actually completed (rescue of laps the game finished/simulated after packets stopped).
    /// Per-lap pit/gap fields would be wrong for such laps and are suppressed; the final lap's
    /// position/gap is later corrected from FinalClassification.</param>
    private void CompleteLap(SessionEntry entry, byte idx, byte completedLapNum, LapData latest, ulong sessionUid, bool staleLapData = false)
    {
        // Formation-lap drop: when this car was on a formation lap (m_safetyCarStatus == 3 saw
        // any frame), discard the buffer and bump LapNumOffset so the next call's race lap 1
        // surfaces as our lap 1. Without this, formation laps were saved as "lap 1" with all-zero
        // ERS/DRS/Mode samples and inflated time, distorting the perf metric for the real race start.
        if (entry.WasFormationLap[idx])
        {
            entry.LapNumOffset[idx] = completedLapNum;
            entry.CurrentLapSamples[idx] = null;
            entry.CurrentLapMotion[idx] = null;
            entry.LapBlueFlag[idx] = false;
            return;
        }

        // Int math on purpose: byte subtraction would wrap to 255 when the offset was bumped
        // past completedLapNum (formation-lap offset + flashback across the S/F line) and the
        // < 1 guard would miss it, recording a bogus "lap 255".
        var savedLapNumInt = completedLapNum - entry.LapNumOffset[idx];
        if (savedLapNumInt < 1)
        {
            entry.CurrentLapSamples[idx] = null;
            entry.CurrentLapMotion[idx] = null;
            entry.LapBlueFlag[idx] = false;
            return;
        }
        var savedLapNum = (byte)savedLapNumInt;

        var driver = GetOrCreateDriver(entry, idx);

        // Authoritative times come from SessionHistoryPacket (server emits validity bits here).
        // LapDataPacket gives us LastLapTimeInMs which was freshly set when the lap completed.
        // History is indexed by the GAME's lap number (m_currentLapNum), so we keep using
        // completedLapNum here even after offsetting our public lap number.
        uint lapTimeMs = latest.LastLapTimeInMs;
        uint s1Ms = 0, s2Ms = 0, s3Ms = 0;
        bool lapValid = latest.CurrentLapInvalid == 0;

        if (entry.LapHistories.TryGetValue(idx, out var hist) &&
            completedLapNum >= 1 && completedLapNum <= hist.LapHistoryDataItems.Length)
        {
            var h = hist.LapHistoryDataItems[completedLapNum - 1];
            if (h.LapTimeInMs > 0)
            {
                lapTimeMs = h.LapTimeInMs;
                s1Ms = (uint)(h.Sector1TimeMsPart + h.Sector1TimeMinutesPart * 60_000);
                s2Ms = (uint)(h.Sector2TimeMsPart + h.Sector2TimeMinutesPart * 60_000);
                s3Ms = (uint)(h.Sector3TimeMsPart + h.Sector3TimeMinutesPart * 60_000);
                // Bit 0 = lap valid, bits 1..3 = sector validity. Keep lap-level here.
                lapValid = (h.LapValidBitFlags & 0x01) != 0;
            }
        }

        // Gap to leader: convert the LapData delta fields (minutes + ms).
        int? gapMs = null;
        if (latest.DeltaToRaceLeaderMsPart != 0 || latest.DeltaToRaceLeaderMinutesPart != 0)
            gapMs = latest.DeltaToRaceLeaderMsPart + latest.DeltaToRaceLeaderMinutesPart * 60_000;

        // Capture tyre state at lap completion.
        var tyre = CaptureTyreSnapshot(entry, idx);
        if (tyre != null)
            driver.TyreByLap[savedLapNum - 1] = tyre;

        var lap = new DriverLap
        {
            LapNum = savedLapNum,
            LapTimeMs = lapTimeMs,
            S1Ms = s1Ms,
            S2Ms = s2Ms,
            S3Ms = s3Ms,
            CompoundActual = tyre?.Act ?? 0,
            CompoundVisual = tyre?.Vis ?? 0,
            TyreAge = tyre?.Age ?? 0,
            TyreWearEnd = tyre?.Wear ?? new float[4],
            Valid = lapValid,
            Pit = !staleLapData && latest.NumPitStops > 0 && latest.PitStatus != 0,
            BlueFlag = entry.LapBlueFlag[idx],
            Position = latest.CarPosition,
            GapToLeaderMs = staleLapData ? null : gapMs,
            RaceFlag = entry.LapMaxFlag[idx] == RaceFlag.Green ? null : entry.LapMaxFlag[idx],
            Samples = entry.CurrentLapSamples[idx],
            Motion = entry.CurrentLapMotion[idx],
        };
        var existingIdx = driver.Laps.FindIndex(l => l.LapNum == savedLapNum);
        if (existingIdx >= 0)
        {
            driver.Laps[existingIdx] = lap;
            _logger.LogInformation("Replaced lap {LapNum} for car {CarIdx} after timeline rewind/flashback.", savedLapNum, idx);
        }
        else
        {
            driver.Laps.Add(lap);
        }

        // Reset sampling buffers and per-car latches for the next lap.
        entry.CurrentLapSamples[idx] = null;
        entry.CurrentLapMotion[idx] = null;
        entry.LapBlueFlag[idx] = false;

        // v3: compute the lap's Perf aggregate and fold its motion into the running track
        // bounds now — both need the sample buffers that are about to leave RAM — then flush
        // samples/motion to the sidecar and drop them. When the weekend folder isn't known
        // yet the lap keeps its buffers; WriteSession's straggler pass picks them up later.
        FoldTrackBounds(entry, lap.Motion);
        ComputeLapPerfInPlace(entry, lap);
        TryFlushLapToSidecar(entry, idx, lap);

        // Checkpoint the compact main file so a crash only loses the tail of a session.
        if (idx == entry.PlayerCarIndex && savedLapNum > 0 && savedLapNum % FlushEveryNPlayerLaps == 0)
        {
            WriteSession(sessionUid, entry);
        }
    }

    /// <summary>Folds one lap's motion trace into the entry's running world-bounds.</summary>
    private static void FoldTrackBounds(SessionEntry entry, List<MotionSample>? motion)
    {
        if (motion == null) return;
        foreach (var m in motion)
        {
            if (m.X < entry.BoundsMinX) entry.BoundsMinX = m.X;
            if (m.X > entry.BoundsMaxX) entry.BoundsMaxX = m.X;
            if (m.Z < entry.BoundsMinZ) entry.BoundsMinZ = m.Z;
            if (m.Z > entry.BoundsMaxZ) entry.BoundsMaxZ = m.Z;
            entry.BoundsAny = true;
        }
    }

    /// <summary>
    /// Computes and stores the lap's ERS/DRS Perf aggregate while samples are still in RAM.
    /// DRS zones may not be captured yet this early in a weekend — the value then falls back
    /// to whole-lap DRS usage (DrsZoneBased = false) and the History detail endpoint lazily
    /// recomputes it from the sidecar once zones exist.
    /// </summary>
    private void ComputeLapPerfInPlace(SessionEntry entry, DriverLap lap)
    {
        if (entry.LatestPackets.GetValueOrDefault("Session") is not SessionPacket session) return;
        try
        {
            var straightMode = TrackGeometryZoneStore.UsesStraightMode(entry.PacketFormat);
            var zones = _zoneStore.GetZones(session.TrackId, straightMode);
            lap.Perf = LapPerfCalculator.Compute(lap.Samples, session.TrackLength, zones, straightMode);
        }
        catch (Exception ex)
        {
            // Perf is a derived nicety; never let it break lap accounting.
            _logger.LogWarning(ex, "Failed to compute lap perf for lap {LapNum}", lap.LapNum);
        }
    }

    /// <summary>
    /// Appends the lap's samples/motion to the "{slug}.samples" sidecar and drops them from
    /// RAM. No-op when the weekend folder isn't resolved yet or the lap has no buffers.
    /// On write failure the buffers stay in RAM so the next checkpoint can retry.
    /// </summary>
    private void TryFlushLapToSidecar(SessionEntry entry, int carIdx, DriverLap lap)
    {
        if (lap.Samples == null && lap.Motion == null) return;
        var mainPath = ResolveMainFilePath(entry, createDirectory: true);
        if (mainPath == null) return;

        try
        {
            lap.SRef = SampleSidecar.Append(SampleSidecar.PathFor(mainPath), new SampleSidecar.LapBlob
            {
                CarIdx = carIdx,
                LapNum = lap.LapNum,
                Samples = lap.Samples,
                Motion = lap.Motion,
            });
            lap.Samples = null;
            lap.Motion = null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to append lap {LapNum} (car {CarIdx}) to samples sidecar", lap.LapNum, carIdx);
        }
    }

    /// <summary>"{HistoryRoot}/{weekendFolder}/{slug}.json", or null before the weekend folder is known.</summary>
    private string? ResolveMainFilePath(SessionEntry entry, bool createDirectory)
    {
        if (entry.WeekendFolder == null) return null;
        var slug = GetPlugin(entry)?.Lookups.GetSessionSlug(entry.SessionType) ?? $"session{entry.SessionType}";
        var logsDir = Path.Combine(HistoryRoot.PersistentDefault, entry.WeekendFolder);
        if (createDirectory) Directory.CreateDirectory(logsDir);
        return Path.Combine(logsDir, $"{slug}.json");
    }

    /// <summary>
    /// Latches a per-car blue-flag bit whenever the game flashes <c>VehicleFiaFlags == 2</c>
    /// on any frame. The bit stays set until the lap completes and is cleared by
    /// <see cref="CompleteLap"/>, so a blue flag shown for even a fraction of a second still
    /// surfaces as a `B` tag on the lap cell.
    /// </summary>
    private static void LatchBlueFlags(SessionEntry entry, CarStatusPacket packet)
    {
        if (packet.CarStatusDataItems == null) return;
        var count = Math.Min(packet.CarStatusDataItems.Length, MaxCars);
        for (byte idx = 0; idx < count; idx++)
        {
            if (packet.CarStatusDataItems[idx].VehicleFiaFlags == 2)
                entry.LapBlueFlag[idx] = true;
        }
    }

    private DriverSessionData GetOrCreateDriver(SessionEntry entry, byte idx)
    {
        if (entry.Drivers.TryGetValue(idx, out var existing))
            return existing;

        var participants = entry.LatestPackets.GetValueOrDefault("Participants") as ParticipantsPacket;
        ParticipantData? p = null;
        if (participants?.Participants != null && idx < participants.Participants.Length)
            p = participants.Participants[idx];

        var driver = new DriverSessionData
        {
            CarIdx = idx,
            TeamId = p?.TeamId ?? 0,
            DriverId = p?.DriverId ?? 0,
            Name = p?.Name ?? $"Car {idx}",
            LiveryColorHex = ExtractLiveryColorHex(p, GetPlugin(entry)?.Lookups),
        };
        entry.Drivers[idx] = driver;
        return driver;
    }

    private void UpdateDriverLiveryColors(SessionEntry entry, ParticipantsPacket packet)
    {
        if (packet.Participants == null) return;
        var lookups = GetPlugin(entry)?.Lookups;
        for (byte idx = 0; idx < packet.Participants.Length && idx < MaxCars; idx++)
        {
            if (!entry.Drivers.TryGetValue(idx, out var driver) || driver.LiveryColorHex != null) continue;
            driver.LiveryColorHex = ExtractLiveryColorHex(packet.Participants[idx], lookups);
        }
    }

    /// <summary>
    /// Picks the team's preferred livery slot via the format-aware
    /// <see cref="ProtocolLookups.LiveryColourSlotOverrides"/> table and converts the RGB
    /// triplet to a #RRGGBB hex string. Returns null when the participant has no colours
    /// or no plugin is registered to supply overrides (falls back to slot 0 = primary).
    /// </summary>
    private static string? ExtractLiveryColorHex(ParticipantData? p, ProtocolLookups? lookups)
    {
        if (p?.LiveryColours == null || p.NumColours == 0 || p.LiveryColours.Length == 0) return null;
        var preferred = lookups?.GetLiveryColourSlot(p.TeamId) ?? 0;
        var slotIdx = Math.Min(preferred, p.NumColours - 1);
        var c = p.LiveryColours[slotIdx];
        if (c == null) return null;
        return $"#{c.Red:X2}{c.Green:X2}{c.Blue:X2}";
    }

    private LapTyreSnapshotV2? CaptureTyreSnapshot(SessionEntry entry, byte idx)
    {
        var status = entry.LatestPackets.GetValueOrDefault("CarStatus") as CarStatusPacket;
        var damage = entry.LatestPackets.GetValueOrDefault("CarDamage") as CarDamagePacket;
        if (status?.CarStatusDataItems == null || idx >= status.CarStatusDataItems.Length)
            return null;
        var s = status.CarStatusDataItems[idx];
        var wear = (damage?.CarDamageDataItems != null && idx < damage.CarDamageDataItems.Length)
            ? damage.CarDamageDataItems[idx].TyresWear
            : new float[4];
        return new LapTyreSnapshotV2
        {
            Act = s.ActualTyreCompound,
            Vis = s.VisualTyreCompound,
            Age = s.TyresAgeLaps,
            Wear = (float[])wear.Clone(),
        };
    }

    private void UpdateRaceFlag(SessionEntry entry, SessionPacket session)
    {
        // SessionPacket.SafetyCarStatus: 0 = No, 1 = Full SC, 2 = Virtual SC, 3 = Formation lap.
        entry.IsFormationLap = session.SafetyCarStatus == 3;
        entry.CurrentRaceFlag = session.SafetyCarStatus switch
        {
            1 => RaceFlag.Sc,
            2 => RaceFlag.Vsc,
            _ => entry.CurrentRaceFlag == RaceFlag.Red ? RaceFlag.Red : RaceFlag.Green,
        };
    }

    private void HandleEvent(SessionEntry entry, TelemetryPacketHeader header, EventPacket evt)
    {
        if (evt.EventCode == "BUTN")
            return;

        // Red flag is "sticky" in CurrentRaceFlag (UpdateRaceFlag has no way to detect a
        // restart from SafetyCarStatus alone — the game zeroes it both during a red flag
        // and during normal racing). The race-restart sequence is STLG → LGOT, so use
        // LGOT after a red flag to drop back to Green; otherwise every subsequent lap
        // inherits RaceFlag.Red via LapMaxFlag and Lap Times stays painted red forever.
        if (evt.EventCode == "LGOT" && entry.CurrentRaceFlag == RaceFlag.Red)
            entry.CurrentRaceFlag = RaceFlag.Green;

        byte? carIdx = evt.Details switch
        {
            FastestLapEvent e => e.VehicleIdx,
            RetirementEvent e => e.VehicleIdx,
            TeamMateInPitsEvent e => e.VehicleIdx,
            RaceWinnerEvent e => e.VehicleIdx,
            PenaltyEvent e => e.VehicleIdx,
            SpeedTrapEvent e => e.VehicleIdx,
            DriveThroughPenaltyServedEvent e => e.VehicleIdx,
            StopGoPenaltyServedEvent e => e.VehicleIdx,
            OvertakeEvent e => e.OvertakingVehicleIdx,
            _ => null,
        };

        byte? lapAtEvent = null;
        if (carIdx is byte ci && ci < MaxCars && entry.CurrentLapNum[ci] != 0)
            lapAtEvent = entry.CurrentLapNum[ci];

        // SCAR.safetyCarType: 0=None, 1=Full, 2=Virtual, 3=Formation Lap.
        // SCAR.eventType:     0=Deployed, 1=Returning, 2=Returned, 3=Resume Race.
        // Only "Deployed" (0) of a Full/Virtual SC sets the per-lap race-flag — Formation Lap
        // is not a real SC and Returning/Returned/Resume just announce the SC leaving (the
        // SessionPacket's m_safetyCarStatus already reflects the current state and clears
        // CurrentRaceFlag on the next tick). The event itself is still recorded below.
        RaceFlag? flag = null;
        if (evt.EventCode == "RDFL")
        {
            flag = RaceFlag.Red;
        }
        else if (evt.EventCode == "SCAR" && evt.Details is SafetyCarEvent sce && sce.EventType == 0)
        {
            if (sce.SafetyCarType == 1) flag = RaceFlag.Sc;
            else if (sce.SafetyCarType == 2) flag = RaceFlag.Vsc;
        }
        if (flag.HasValue)
            entry.CurrentRaceFlag = flag.Value;

        // Session-wide flag events (RDFL, SCAR full/virtual) have no carIdx, so the per-car
        // fallback above leaves lapAtEvent null. The Lap Chart positions flag bands by lap,
        // so without this fallback red/SC/VSC bands silently disappear. Use the player car's
        // current lap — natural reference for a single-player session.
        if (flag.HasValue && lapAtEvent is null
            && entry.PlayerCarIndex < MaxCars
            && entry.CurrentLapNum[entry.PlayerCarIndex] != 0)
        {
            lapAtEvent = entry.CurrentLapNum[entry.PlayerCarIndex];
        }

        entry.Events.Add(new SessionLogEventV2
        {
            TimeS = header.SessionTime,
            Code = evt.EventCode,
            Lap = lapAtEvent,
            CarIdx = carIdx,
            Flag = flag,
            Details = evt.Details,
        });
    }

    private void HandleFlashback(SessionEntry entry, TelemetryPacketHeader header, EventPacket evt)
    {
        var rewindToTime = (evt.Details as FlashbackEvent)?.FlashbackSessionTime ?? header.SessionTime;
        ResetLapTracking(entry, rewindToTime);
    }

    /// <summary>
    /// Shared timeline-rewind reset for flashbacks (FLBK) and session restarts (SSTA):
    /// clears the OFI duplicate-gate baseline, drops in-flight sample buffers, and forces a
    /// lap re-anchor for every car. <paramref name="baselineTime"/> is the session time the
    /// timeline resumes from (flashback target or restart moment).
    /// </summary>
    private static void ResetLapTracking(SessionEntry entry, float baselineTime)
    {
        // Timeline rewind: the game may resume with lower OverallFrameIdentifier values than we had
        // already processed. Reset so ShouldAcceptFrame does not drop all post-rewind telemetry.
        entry.LastOverallFrameIdentifierProcessed = 0;
        for (var i = 0; i < MaxCars; i++)
        {
            entry.CurrentLapSamples[i] = null;
            entry.CurrentLapMotion[i] = null;
            entry.LastTelemetryTickS[i] = baselineTime;
            entry.LastMotionTickS[i] = baselineTime;
            entry.CurrentLapStartSessionTimeS[i] = baselineTime;
            entry.LapBlueFlag[i] = false;
            entry.PrevLapDistance[i] = 0f;
            entry.PrevPitStatus[i] = 0;
            // The in-lap flag accumulation should reflect only the retaken segment
            // (matches cleared motion/telemetry buffers).
            entry.LapMaxFlag[i] = entry.CurrentRaceFlag;
            // Force a re-anchor on the next LapData frame (the prevNum == 0 branch in
            // ProcessLapData). Two reasons:
            //  1. A flashback across the S/F line rewinds m_currentLapNum — without the reset
            //     the lap-boundary check fires "backwards" (prev 5 → current 4) and CompleteLap
            //     records a bogus lap 5 for the timeline that was just undone (stale
            //     LastLapTimeInMs, stale tyre snapshot). The real lap 5, when re-driven, only
            //     papers over it via the replace path — and never does if the session ends first.
            //  2. The re-anchor recomputes the lap start as sessionTime - currentLapTime,
            //     which is correct when the rewind lands mid-lap; baselineTime (set above as a
            //     fallback) is only right for the sub-frame gap until LapData arrives.
            entry.CurrentLapNum[i] = 0;
            // Re-latched from SessionPacket on the very next frame if the rewind landed on a
            // formation lap; clearing prevents a stale latch from discarding a real lap.
            entry.WasFormationLap[i] = false;
        }
    }

    private static bool ShouldAcceptFrame(SessionEntry entry, TelemetryPacketHeader header)
    {
        // Drop duplicated/out-of-order high-frequency packets. Baseline resets on flashback
        // (see HandleFlashback) so rewind timelines are not mistaken for stale duplicates.
        if (header.OverallFrameIdentifier < entry.LastOverallFrameIdentifierProcessed)
            return false;

        entry.LastOverallFrameIdentifierProcessed = header.OverallFrameIdentifier;
        return true;
    }

    /// <summary>Flush any remaining sessions to disk. Safety net for app shutdown.</summary>
    public void Flush()
    {
        lock (_lock)
        {
            foreach (var (uid, entry) in _sessions)
                FinalizeAndWrite(entry, uid, entry.LastKnownSessionTimeS);

            _sessions.Clear();
        }
    }

    /// <summary>
    /// Writes a one-shot checkpoint for sessions that stopped receiving packets more than
    /// <paramref name="idleAfter"/> ago. Covers the "game closed without SEND" case (Alt+F4,
    /// crash): without this, rescue laps and classification would sit in RAM until app
    /// shutdown. The entry is NOT finalized/removed — a paused single-player game also stops
    /// sending packets, and the session must keep recording when it resumes. Called
    /// periodically by <see cref="SessionLoggerWriter"/> when its queue goes quiet.
    /// </summary>
    public void CheckpointIdleSessions(TimeSpan idleAfter)
    {
        lock (_lock)
        {
            var now = DateTime.UtcNow;
            foreach (var (uid, entry) in _sessions)
            {
                if (entry.IdleCheckpointWritten) continue;
                if (now - entry.LastPacketAtUtc < idleAfter) continue;
                entry.IdleCheckpointWritten = true;
                _logger.LogInformation(
                    "Session {Uid} received no packets for {Idle:F0}s — writing idle checkpoint.",
                    uid, (now - entry.LastPacketAtUtc).TotalSeconds);
                FinalizeAndWrite(entry, uid, entry.LastKnownSessionTimeS);
            }
        }
    }

    /// <summary>Complete rescue laps, backfill authoritative end-of-race data, write the file.
    /// Shared by the SEND / FinalClassification / Flush / idle-checkpoint paths. Idempotent for
    /// an in-progress session: the rescue only completes laps whose history time is set, so
    /// calling this mid-race (idle checkpoint during a pause) leaves the live lap untouched.</summary>
    private void FinalizeAndWrite(SessionEntry entry, ulong uid, float sessionTime)
    {
        FinalizePendingLaps(entry, uid, sessionTime);
        BackfillFinalClassification(entry);
        WriteSession(uid, entry);
    }

    /// <summary>
    /// In single player the game stops streaming LapData the moment the player crosses the
    /// finish line, so rescue laps of cars finishing after the player carry the position/gap
    /// frozen at that moment. The FinalClassification packet has the authoritative result —
    /// copy it onto each driver (<see cref="DriverSessionData.Final"/>) and correct the final
    /// lap's position/gap for race sessions.
    /// </summary>
    private void BackfillFinalClassification(SessionEntry entry)
    {
        if (entry.LatestFinalClassification is not { ClassificationData: not null } cls)
            return;

        // Winner reference for gap reconstruction (race only; TotalRaceTime is 0 in quali).
        double? winnerTimeS = null;
        byte winnerLaps = 0;
        foreach (var c in cls.ClassificationData)
        {
            if (c is { Position: 1, ResultStatus: 3 })
            {
                winnerTimeS = c.TotalRaceTime;
                winnerLaps = c.NumLaps;
                break;
            }
        }

        var isRace = IsRaceLikeSession(entry.SessionType);
        var count = Math.Min(cls.ClassificationData.Length, MaxCars);
        for (byte idx = 0; idx < count; idx++)
        {
            var c = cls.ClassificationData[idx];
            if (c == null || c.ResultStatus == 0 || c.Position == 0) continue; // empty slot
            // Create the driver when missing: a car that crashed on lap 1 never completed a
            // lap, so it has no Drivers entry — without this it would be absent from the
            // saved per-driver data (and the History Results table) despite being classified.
            var driver = GetOrCreateDriver(entry, idx);

            driver.Final = new DriverFinalResultV3
            {
                Position = c.Position,
                NumLaps = c.NumLaps,
                GridPosition = c.GridPosition,
                Points = c.Points,
                ResultStatus = c.ResultStatus,
                ResultReason = c.ResultReason,
                BestLapTimeInMs = c.BestLapTimeInMs,
                TotalRaceTimeS = c.TotalRaceTime,
                PenaltiesTimeS = c.PenaltiesTime,
                NumPenalties = c.NumPenalties,
                NumPitStops = c.NumPitStops,
            };

            if (!isRace) continue;
            var lastLap = driver.Laps.MaxBy(l => l.LapNum);
            if (lastLap == null) continue;
            lastLap.Position = c.Position;
            // Gap only reconstructable for cars classified on the lead lap; lapped cars'
            // TotalRaceTime is their own finish time and doesn't compare.
            if (c.ResultStatus == 3 && winnerTimeS.HasValue && c.NumLaps == winnerLaps)
                lastLap.GapToLeaderMs = (int)Math.Round((c.TotalRaceTime - winnerTimeS.Value) * 1000.0);
        }
    }


    private void FinalizePendingLaps(SessionEntry entry, TelemetryPacketHeader header)
    {
        FinalizePendingLaps(entry, header.SessionUid, header.SessionTime);
    }

    private void FinalizePendingLaps(SessionEntry entry, ulong sessionUid, float sessionTime)
    {
        var lapData = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;
        if (lapData == null || lapData.LapDataItems == null)
            return;

        // Backfill sector times for laps that were recorded before SessionHistory arrived.
        foreach (var driver in entry.Drivers.Values)
        {
            if (!entry.LapHistories.TryGetValue(driver.CarIdx, out var hist)) continue;
            foreach (var lap in driver.Laps)
            {
                if (lap.LapNum >= 1 && lap.LapNum <= hist.LapHistoryDataItems.Length)
                {
                    var h = hist.LapHistoryDataItems[lap.LapNum - 1];
                    if (h.LapTimeInMs > 0)
                    {
                        if (lap.S1Ms == 0) lap.S1Ms = (uint)(h.Sector1TimeMsPart + h.Sector1TimeMinutesPart * 60_000);
                        if (lap.S2Ms == 0) lap.S2Ms = (uint)(h.Sector2TimeMsPart + h.Sector2TimeMinutesPart * 60_000);
                        if (lap.S3Ms == 0) lap.S3Ms = (uint)(h.Sector3TimeMsPart + h.Sector3TimeMinutesPart * 60_000);
                        if (lap.LapTimeMs == 0) lap.LapTimeMs = h.LapTimeInMs;
                        lap.Valid = (h.LapValidBitFlags & 0x01) != 0;
                    }
                }
            }
        }

        var count = Math.Min(lapData.LapDataItems.Length, MaxCars);
        for (byte carIdx = 0; carIdx < count; carIdx++)
        {
            var currentNum = entry.CurrentLapNum[carIdx];
            if (currentNum == 0)
                continue;

            var driver = GetOrCreateDriver(entry, carIdx);
            var offset = entry.LapNumOffset[carIdx];
            // The most recently completed game-lap is currentNum - 1; in our published numbering
            // it surfaces as gameLap - offset (offset is 1 once the formation lap was dropped).
            var completedLapNum = (byte)(currentNum - 1);

            if (completedLapNum >= 1)
            {
                var savedLapNum = completedLapNum > offset ? (byte)(completedLapNum - offset) : (byte)0;
                if (savedLapNum >= 1 && !driver.Laps.Any(l => l.LapNum == savedLapNum))
                {
                    var lapCompleted =
                        (entry.LapHistories.TryGetValue(carIdx, out var histA) && histA.NumLaps >= currentNum) ||
                        lapData.LapDataItems[carIdx].LastLapTimeInMs > 0;

                    if (lapCompleted)
                        CompleteLap(entry, carIdx, completedLapNum, lapData.LapDataItems[carIdx], sessionUid);
                }
            }

            // Final-lap rescue: when the race finishes at the chequered flag, m_currentLapNum
            // does not advance past the last lap (no "boundary crossing" to trigger CompleteLap),
            // and the SEND-time finaliser above only ever looks at currentNum-1 — so the final
            // lap was getting silently dropped. SessionHistory keeps the authoritative time for
            // every lap once the game records it, so any history entry whose lap-time is set but
            // does not yet have a DriverLap is finalised here.
            if (entry.LapHistories.TryGetValue(carIdx, out var histB))
            {
                var items = histB.LapHistoryDataItems;
                var maxLap = (byte)Math.Min(items.Length, histB.NumLaps);
                for (byte n = 1; n <= maxLap; n++)
                {
                    if (items[n - 1].LapTimeInMs == 0) continue;
                    if (n <= offset) continue; // formation slot — never published
                    var savedNum = (byte)(n - offset);
                    if (driver.Laps.Any(l => l.LapNum == savedNum)) continue;

                    // The in-RAM sample buffers belong to the lap that was in progress when
                    // packets stopped (currentNum). Only that lap may take them — laps the game
                    // finished/simulated afterwards (or earlier gaps) must not steal the buffers,
                    // and their frozen LapData snapshot is stale for pit/gap purposes.
                    var isCurrentGameLap = n == currentNum;
                    List<LapSample>? stashSamples = null;
                    List<MotionSample>? stashMotion = null;
                    if (!isCurrentGameLap)
                    {
                        stashSamples = entry.CurrentLapSamples[carIdx];
                        stashMotion = entry.CurrentLapMotion[carIdx];
                        entry.CurrentLapSamples[carIdx] = null;
                        entry.CurrentLapMotion[carIdx] = null;
                    }

                    CompleteLap(entry, carIdx, n, lapData.LapDataItems[carIdx], sessionUid,
                        staleLapData: !isCurrentGameLap);

                    if (!isCurrentGameLap)
                    {
                        entry.CurrentLapSamples[carIdx] = stashSamples;
                        entry.CurrentLapMotion[carIdx] = stashMotion;
                    }
                }
            }
        }
    }

    private void ResolveWeekendFolder(SessionEntry entry, SessionPacket session)
    {
        var wid = session.WeekendLinkIdentifier;
        entry.WeekendLinkId = wid;

        if (_weekendFolders.TryGetValue(wid, out var existing))
        {
            entry.WeekendFolder = existing;
            return;
        }

        var trackName = GetPlugin(entry)?.Lookups.GetTrackName(session.TrackId) ?? $"Track{session.TrackId}";
        var safeName = string.Join("_", trackName.Split(Path.GetInvalidFileNameChars()));
        var now = DateTimeOffset.Now;
        var folder = $"F1{entry.GameYear}_{safeName}_{now:yyyy-MM-dd_HH-mm}";

        _weekendFolders[wid] = folder;
        entry.WeekendFolder = folder;
    }

    private Dictionary<string, PerTypeEntryCounts> BuildPerTypeForThisSession(SessionEntry entry)
    {
        var result = new Dictionary<string, PerTypeEntryCounts>();
        for (byte id = 0; id < entry.DiagPerTypeSeen.Length; id++)
        {
            if (entry.DiagPerTypeSeen[id] == 0) continue;
            result[ResolvePacketName(id)] = new PerTypeEntryCounts
            {
                Seen = entry.DiagPerTypeSeen[id],
                FirstSessionTimeS = entry.DiagPerTypeFirstSessionTimeS[id],
            };
        }
        return result;
    }

    private void WriteSession(ulong uid, SessionEntry entry)
    {
        if (entry.WeekendFolder == null)
            return;

        // Need at least a Session packet for metadata
        var sessionPacket = entry.LatestPackets.GetValueOrDefault("Session") as SessionPacket;
        if (sessionPacket == null)
            return;

        try
        {
            var plugin = GetPlugin(entry);
            var lookups = plugin?.Lookups;
            // Writes always target the persisted root (Settings tab), not any ephemeral
            // History "Select Folder" override that might be active for read-only browsing.
            var filePath = ResolveMainFilePath(entry, createDirectory: true);
            if (filePath == null) return;

            // Straggler pass: laps completed before the weekend folder was resolved (or whose
            // sidecar append failed) still hold samples in RAM. Flush them now so the main
            // file we're about to write only carries srefs, never inline sample arrays.
            foreach (var (carIdx, drv) in entry.Drivers)
                foreach (var l in drv.Laps)
                    if (l.SRef == null && (l.Samples != null || l.Motion != null))
                        TryFlushLapToSidecar(entry, carIdx, l);

            // Player setup snapshots live on the player's DriverSessionData.
            if (uid == _currentSessionUid)
            {
                var snapshots = _lapSetupStore.GetSnapshots(entry.PlayerCarIndex);
                if (snapshots != null && snapshots.Count > 0)
                {
                    var playerDriver = GetOrCreateDriver(entry, entry.PlayerCarIndex);
                    playerDriver.SetupByLap = new Dictionary<int, CarSetupData>();
                    foreach (var (lapIdx, setup) in snapshots)
                        if (setup is CarSetupData cs)
                            playerDriver.SetupByLap[lapIdx] = cs;
                }
            }

            var bounds = ComputeTrackBounds(entry);
            var finalClassification = entry.LatestPackets.GetValueOrDefault("FinalClassification");

            var logData = new SessionLogDataV2
            {
                Meta = new SessionLogMetaV2
                {
                    SchemaVersion = 3,
                    TrackId = sessionPacket.TrackId,
                    TrackName = lookups?.GetTrackName(sessionPacket.TrackId) ?? $"Track{sessionPacket.TrackId}",
                    SessionType = entry.SessionType,
                    SessionTypeName = lookups?.GetSessionName(entry.SessionType) ?? $"Session{entry.SessionType}",
                    GameYear = entry.GameYear,
                    PacketFormat = entry.PacketFormat,
                    Formula = sessionPacket.Formula,
                    FormulaName = lookups?.GetFormulaName(sessionPacket.Formula) ?? $"Formula {sessionPacket.Formula}",
                    WeekendLinkId = entry.WeekendLinkId,
                    SessionLinkId = sessionPacket.SessionLinkIdentifier,
                    PlayerCarIndex = entry.PlayerCarIndex,
                    SavedAt = DateTimeOffset.Now,
                    TrackLengthM = sessionPacket.TrackLength,
                    TotalLaps = sessionPacket.TotalLaps,
                    Sector2StartM = sessionPacket.Sector2LapDistanceStart,
                    Sector3StartM = sessionPacket.Sector3LapDistanceStart,
                    TrackBoundsXZ = bounds,
                },
                Packets = new Dictionary<string, object>(entry.LatestPackets),
                Drivers = entry.Drivers.Count > 0
                    ? new Dictionary<int, DriverSessionData>(entry.Drivers)
                    : null,
                LapHistories = entry.LapHistories.Count > 0
                    ? new Dictionary<int, SessionHistoryPacket>(entry.LapHistories)
                    : null,
                Events = entry.Events.Count > 0
                    ? new List<SessionLogEventV2>(entry.Events)
                    : null,
                FinalClassification = finalClassification,
                IngressDiagnostics = new IngressDiagnosticsV2
                {
                    TelemetryAccepted = entry.DiagTelemetryAccepted,
                    TelemetryRejectedOfi = entry.DiagTelemetryRejectedOfi,
                    TelemetryRejectedNoLapData = entry.DiagTelemetryRejectedNoLapData,
                    TelemetryGated20Hz = entry.DiagTelemetryGated20Hz,
                    MotionAccepted = entry.DiagMotionAccepted,
                    MotionRejectedOfi = entry.DiagMotionRejectedOfi,
                    MotionRejectedNoLapData = entry.DiagMotionRejectedNoLapData,
                    MotionGated10Hz = entry.DiagMotionGated10Hz,
                    FirstTelemetryAcceptedAtS = entry.DiagFirstTelemetryAcceptedAtS,
                    FirstMotionAcceptedAtS = entry.DiagFirstMotionAcceptedAtS,
                    QueueDroppedTotal = Volatile.Read(ref _droppedEnqueueCount),
                    IngressPacketCounts = _ingressDiag.Snapshot()
                        .ToDictionary(kv => kv.Key, kv => (object)kv.Value),
                    HeaderFailedUnknownId = _ingressDiag.HeaderFailedUnknownId,
                    PerTypeForThisSession = BuildPerTypeForThisSession(entry),
                },
            };

            var json = JsonSerializer.Serialize(logData, JsonOptions);
            var tmpPath = filePath + ".tmp";
            File.WriteAllText(tmpPath, json);
            File.Move(tmpPath, filePath, overwrite: true);

            _logger.LogInformation("Session saved to {FilePath}", filePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save session log");
        }
    }

    private static TrackBounds? ComputeTrackBounds(SessionEntry entry)
    {
        // Running bounds are folded in at lap completion (motion leaves RAM right after).
        float minX = entry.BoundsMinX, maxX = entry.BoundsMaxX;
        float minZ = entry.BoundsMinZ, maxZ = entry.BoundsMaxZ;
        bool any = entry.BoundsAny;

        return any ? new TrackBounds { MinX = minX, MaxX = maxX, MinZ = minZ, MaxZ = maxZ } : null;
    }

    private sealed class SessionEntry
    {
        public byte PlayerCarIndex { get; set; }
        public byte GameYear { get; set; }
        /// <summary>m_packetFormat for this session (2025, 2026, …). Written into the saved meta
        /// so HistoryReader can pick the right lookup tables on load.</summary>
        public ushort PacketFormat { get; set; }
        public byte SessionType { get; set; }
        public uint WeekendLinkId { get; set; }
        public string? WeekendFolder { get; set; }

        /// <summary>Latest snapshot of each packet type (key = packet name).</summary>
        public Dictionary<string, object> LatestPackets { get; } = new();

        /// <summary>Per-car lap history (accumulated, key = carIdx).</summary>
        public Dictionary<int, SessionHistoryPacket> LapHistories { get; } = new();

        /// <summary>All events in order (v2 shape, with lap + carIdx + flag).</summary>
        public List<SessionLogEventV2> Events { get; } = new();

        /// <summary>Per-car accumulated lap+sample data (v2 schema).</summary>
        public Dictionary<int, DriverSessionData> Drivers { get; } = new();

        // Per-car sampling buffers for the currently-active lap. Flushed into Drivers[idx].Laps
        // on lap completion and reset.
        public readonly List<LapSample>?[] CurrentLapSamples = new List<LapSample>?[MaxCars];
        public readonly List<MotionSample>?[] CurrentLapMotion = new List<MotionSample>?[MaxCars];
        public readonly float[] LastTelemetryTickS = new float[MaxCars];
        public readonly float[] LastMotionTickS = new float[MaxCars];
        public readonly byte[] CurrentLapNum = new byte[MaxCars];
        public readonly float[] CurrentLapStartSessionTimeS = new float[MaxCars];
        /// <summary>Previous frame's m_lapDistance per car. Used to detect uncounted S/F crossings
        /// in non-race sessions (out-lap → flying-lap, cool-down → push), where m_currentLapNum
        /// stays the same but lapDistance wraps. Initialised lazily on first LapData frame.</summary>
        public readonly float[] PrevLapDistance = new float[MaxCars];
        public readonly byte[] PrevPitStatus = new byte[MaxCars];

        // Live race-control state. Applied to each newly completed lap.
        public RaceFlag CurrentRaceFlag = RaceFlag.Green;
        /// <summary>Highest flag seen during the current lap per car (gets stamped at lap completion).</summary>
        public readonly RaceFlag[] LapMaxFlag = new RaceFlag[MaxCars];
        /// <summary>Per-car latch: set true when CarStatusPacket.VehicleFiaFlags == 2 (blue) is
        /// seen at any frame during the current lap. Cleared at lap completion.</summary>
        public readonly bool[] LapBlueFlag = new bool[MaxCars];

        /// <summary>True while the current SessionPacket reports a formation lap (m_safetyCarStatus == 3).</summary>
        public bool IsFormationLap;
        /// <summary>Per-car latch: any frame during the current lap saw IsFormationLap == true.
        /// On lap completion this drives the formation-lap skip in CompleteLap and bumps LapNumOffset.</summary>
        public readonly bool[] WasFormationLap = new bool[MaxCars];
        /// <summary>Per-car shift between game's m_currentLapNum and the lap number we publish
        /// (DriverLap.LapNum = gameLapNum - LapNumOffset). Stays 0 in standing-start races / sprints
        /// and becomes 1 after the formation lap is detected and dropped, so race lap 1 surfaces as lap 1.</summary>
        public readonly byte[] LapNumOffset = new byte[MaxCars];

        public float LastKnownSessionTimeS { get; set; }
        public uint LastOverallFrameIdentifierProcessed { get; set; }

        /// <summary>Wall-clock time of the last packet for this session. Drives the idle
        /// checkpoint in <see cref="CheckpointIdleSessions"/>.</summary>
        public DateTime LastPacketAtUtc { get; set; } = DateTime.UtcNow;
        /// <summary>One-shot latch so an idle session is checkpointed once per quiet period,
        /// not on every timer tick. Reset whenever a packet arrives.</summary>
        public bool IdleCheckpointWritten { get; set; }

        /// <summary>Set after SEND. The entry stays in the sessions map to merge the
        /// FinalClassification / final SessionHistory packets that follow SEND in single
        /// player; all other late packets are ignored (see the Finalized branch in
        /// <see cref="ProcessPacket"/>).</summary>
        public bool Finalized { get; set; }

        /// <summary>Typed snapshot of the last FinalClassification packet (also kept in
        /// <see cref="LatestPackets"/> for the raw dump). Source for per-driver backfill.</summary>
        public FinalClassificationPacket? LatestFinalClassification { get; set; }

        // Running world X/Z bounds, folded in at lap completion just before the lap's motion
        // buffer is flushed to the sidecar and dropped from RAM (v3). Replaces the v2 approach
        // of re-scanning every lap's in-memory motion at write time.
        public float BoundsMinX = float.MaxValue, BoundsMaxX = float.MinValue;
        public float BoundsMinZ = float.MaxValue, BoundsMaxZ = float.MinValue;
        public bool BoundsAny;

        // ---------------------------------------------------------------------
        // Sampling diagnostics (one-shot field for the "no samples on first laps"
        // investigation). Counts hits per reject reason so the next race log can
        // tell us deterministically WHY samples were missing instead of guessing.
        // ---------------------------------------------------------------------
        public long DiagTelemetryAccepted;
        public long DiagTelemetryRejectedOfi;
        public long DiagTelemetryRejectedNoLapData;
        public long DiagTelemetryGated20Hz;
        public long DiagMotionAccepted;
        public long DiagMotionRejectedOfi;
        public long DiagMotionRejectedNoLapData;
        public long DiagMotionGated10Hz;
        public bool DiagLoggedFirstTelemetryReject;
        public bool DiagLoggedFirstMotionReject;
        public float DiagFirstTelemetryAcceptedAtS = -1f;
        public float DiagFirstMotionAcceptedAtS = -1f;

        // Per-entry per-packet-type "did ProcessPacket actually see this for THIS uid"
        // counter. The app-wide IngressDiagnosticsTracker conflates all sessions, so it
        // cannot tell us whether the race entry received CarTelemetry packets early
        // (and they were dropped at the switch / sampler) vs never received them at all
        // (game using a different sessionUid for the pre-race phase).
        public readonly long[] DiagPerTypeSeen = new long[64];
        public readonly float[] DiagPerTypeFirstSessionTimeS = new float[64];
    }

}
