using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Serialization;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
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

    private const int MaxCars = 22;

    // Periodic checkpoint cadence: every N completed laps of the player car we rewrite the
    // session JSON so a crash only loses the tail of a session, not the whole thing.
    private const int FlushEveryNPlayerLaps = 5;

    private readonly object _lock = new();

    /// <summary>All accumulated sessions keyed by sessionUid.</summary>
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

    public SessionLogger(LapSetupStore lapSetupStore, ILogger<SessionLogger> logger)
    {
        _lapSetupStore = lapSetupStore;
        _logger = logger;
    }

    /// <summary>
    /// Called from the UDP / ingress thread. Non-blocking: pushes the packet to an internal channel
    /// which <see cref="SessionLoggerWriter"/> drains on a dedicated task.
    /// </summary>
    public void Enqueue(TelemetryPacketHeader header, byte packetId, object data)
    {
        _queue.Writer.TryWrite(new LoggerEnvelope(header, packetId, data));
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
                _sessions[uid] = entry;
            }

            entry.PlayerCarIndex = header.PlayerCarIndex;
            entry.GameYear = header.GameYear;

            // Update latest snapshot for every non-high-frequency packet. Motion / MotionEx
            // would otherwise balloon the in-memory snapshot dictionary.
            if (packetId != (byte)F125PacketId.Motion && packetId != (byte)F125PacketId.MotionEx)
            {
                var name = F125PacketNames.Get(packetId);
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
                    if (evt.EventCode == "SEND")
                    {
                        // The chequered flag holds CurrentLapNum at TotalLaps instead of
                        // incrementing it, so the lap-boundary path in ProcessLapData never
                        // fires for the final lap of a race. Finalize it here from history.
                        FinalizeOpenLaps(entry, uid);
                        WriteSession(uid, entry);
                        _sessions.Remove(uid);
                        return;
                    }
                    break;
                case CarTelemetryPacket telemetry:
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
            }
        }
    }

    private void SampleTelemetry(SessionEntry entry, TelemetryPacketHeader header, CarTelemetryPacket packet)
    {
        var lapPacket = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;
        if (lapPacket == null) return;
        var statusPacket = entry.LatestPackets.GetValueOrDefault("CarStatus") as CarStatusPacket;

        var count = Math.Min(packet.CarTelemetryData.Length, Math.Min(lapPacket.LapDataItems.Length, MaxCars));
        for (byte idx = 0; idx < count; idx++)
        {
            if (header.SessionTime - entry.LastTelemetryTickS[idx] < TelemetryGateS)
                continue;
            entry.LastTelemetryTickS[idx] = header.SessionTime;

            var t = packet.CarTelemetryData[idx];
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
            });
        }
    }

    private void SampleMotion(SessionEntry entry, TelemetryPacketHeader header, MotionPacket packet)
    {
        var lapPacket = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;
        if (lapPacket == null) return;

        var count = Math.Min(packet.CarMotionData.Length, Math.Min(lapPacket.LapDataItems.Length, MaxCars));
        for (byte idx = 0; idx < count; idx++)
        {
            if (header.SessionTime - entry.LastMotionTickS[idx] < MotionGateS)
                continue;
            entry.LastMotionTickS[idx] = header.SessionTime;

            var m = packet.CarMotionData[idx];
            var l = lapPacket.LapDataItems[idx];

            var buf = entry.CurrentLapMotion[idx] ??= new List<MotionSample>(128);
            buf.Add(new MotionSample
            {
                T = header.SessionTime - entry.CurrentLapStartSessionTimeS[idx],
                D = l.LapDistance,
                X = m.WorldPositionX,
                Z = m.WorldPositionZ,
            });
        }
    }

    private void ProcessLapData(SessionEntry entry, TelemetryPacketHeader header, LapDataPacket packet)
    {
        var count = Math.Min(packet.LapDataItems.Length, MaxCars);
        for (byte idx = 0; idx < count; idx++)
        {
            var lap = packet.LapDataItems[idx];

            // Track the highest race-control flag the car saw during this lap.
            if (entry.CurrentRaceFlag > entry.LapMaxFlag[idx])
                entry.LapMaxFlag[idx] = entry.CurrentRaceFlag;

            var currentNum = lap.CurrentLapNum;
            var prevNum = entry.CurrentLapNum[idx];
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
            }
        }
    }

    /// <summary>
    /// Completes any car's currently-open lap that the game has actually finished but the
    /// lap-boundary path in <see cref="ProcessLapData"/> never observed (e.g. the race's
    /// final lap, where CurrentLapNum doesn't advance after the chequered flag).
    /// SessionHistory is the gate: a non-zero LapTimeInMs means the car crossed the line on
    /// that lap, which excludes quali in/out-laps and mid-lap retirements.
    /// </summary>
    private void FinalizeOpenLaps(SessionEntry entry, ulong sessionUid)
    {
        var lapPacket = entry.LatestPackets.GetValueOrDefault("LapData") as LapDataPacket;

        for (byte idx = 0; idx < MaxCars; idx++)
        {
            var openLapNum = entry.CurrentLapNum[idx];
            if (openLapNum == 0)
                continue;

            if (!entry.LapHistories.TryGetValue(idx, out var hist))
                continue;
            if (openLapNum > hist.LapHistoryDataItems.Length)
                continue;
            if (hist.LapHistoryDataItems[openLapNum - 1].LapTimeInMs == 0)
                continue;

            var latest = (lapPacket != null && idx < lapPacket.LapDataItems.Length)
                ? lapPacket.LapDataItems[idx]
                : new LapData();

            CompleteLap(entry, idx, openLapNum, latest, sessionUid);
            entry.CurrentLapNum[idx] = 0;
        }
    }

    private void CompleteLap(SessionEntry entry, byte idx, byte completedLapNum, LapData latest, ulong sessionUid)
    {
        var driver = GetOrCreateDriver(entry, idx);

        // Authoritative times come from SessionHistoryPacket (server emits validity bits here).
        // LapDataPacket gives us LastLapTimeInMs which was freshly set when the lap completed.
        uint lapTimeMs = latest.LastLapTimeInMs;
        uint s1Ms = 0, s2Ms = 0, s3Ms = 0;
        bool lapValid = latest.CurrentLapInvalid == 0;

        if (entry.LapHistories.TryGetValue(idx, out var hist) &&
            completedLapNum >= 1 && completedLapNum <= hist.LapHistoryDataItems.Length)
        {
            var h = hist.LapHistoryDataItems[completedLapNum - 1];
            if (h.LapTimeInMs > 0) lapTimeMs = h.LapTimeInMs;
            s1Ms = (uint)(h.Sector1TimeMsPart + h.Sector1TimeMinutesPart * 60_000);
            s2Ms = (uint)(h.Sector2TimeMsPart + h.Sector2TimeMinutesPart * 60_000);
            s3Ms = (uint)(h.Sector3TimeMsPart + h.Sector3TimeMinutesPart * 60_000);
            // Bit 0 = lap valid, bits 1..3 = sector validity. Keep lap-level here.
            lapValid = (h.LapValidBitFlags & 0x01) != 0;
        }

        // Gap to leader: convert the LapData delta fields (minutes + ms).
        int? gapMs = null;
        if (latest.DeltaToRaceLeaderMsPart != 0 || latest.DeltaToRaceLeaderMinutesPart != 0)
            gapMs = latest.DeltaToRaceLeaderMsPart + latest.DeltaToRaceLeaderMinutesPart * 60_000;

        // Capture tyre state at lap completion.
        var tyre = CaptureTyreSnapshot(entry, idx);
        if (tyre != null)
            driver.TyreByLap[completedLapNum - 1] = tyre;

        var lap = new DriverLap
        {
            LapNum = completedLapNum,
            LapTimeMs = lapTimeMs,
            S1Ms = s1Ms,
            S2Ms = s2Ms,
            S3Ms = s3Ms,
            CompoundActual = tyre?.Act ?? 0,
            CompoundVisual = tyre?.Vis ?? 0,
            TyreAge = tyre?.Age ?? 0,
            TyreWearEnd = tyre?.Wear ?? new float[4],
            Valid = lapValid,
            Pit = latest.NumPitStops > 0 && latest.PitStatus != 0,
            BlueFlag = entry.LapBlueFlag[idx],
            Position = latest.CarPosition,
            GapToLeaderMs = gapMs,
            RaceFlag = entry.LapMaxFlag[idx] == RaceFlag.Green ? null : entry.LapMaxFlag[idx],
            Samples = entry.CurrentLapSamples[idx],
            Motion = entry.CurrentLapMotion[idx],
        };
        driver.Laps.Add(lap);

        // Reset sampling buffers and per-car latches for the next lap.
        entry.CurrentLapSamples[idx] = null;
        entry.CurrentLapMotion[idx] = null;
        entry.LapBlueFlag[idx] = false;

        // Checkpoint the session to disk on every Nth player lap so a crash only loses the tail.
        // We deliberately do NOT null out samples of prior laps afterwards: WriteSession serializes
        // the whole in-memory state each time, and nullified samples would overwrite what was
        // previously persisted. Accept ~100 MB peak RAM for a 60-lap race.
        if (idx == entry.PlayerCarIndex && completedLapNum > 0 && completedLapNum % FlushEveryNPlayerLaps == 0)
        {
            WriteSession(sessionUid, entry);
        }
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
        };
        entry.Drivers[idx] = driver;
        return driver;
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
        entry.CurrentRaceFlag = session.SafetyCarStatus switch
        {
            1 => RaceFlag.Sc,
            2 => RaceFlag.Vsc,
            _ => entry.CurrentRaceFlag == RaceFlag.Red ? RaceFlag.Red : RaceFlag.Green,
        };
    }

    private void HandleEvent(SessionEntry entry, TelemetryPacketHeader header, EventPacket evt)
    {
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

        RaceFlag? flag = evt.EventCode switch
        {
            "RDFL" => RaceFlag.Red,
            "SCAR" => evt.Details is SafetyCarEvent sce && sce.SafetyCarType == 2 ? RaceFlag.Vsc : RaceFlag.Sc,
            _ => null,
        };
        if (flag.HasValue)
            entry.CurrentRaceFlag = flag.Value;

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

    /// <summary>Flush any remaining sessions to disk. Safety net for app shutdown.</summary>
    public void Flush()
    {
        lock (_lock)
        {
            foreach (var (uid, entry) in _sessions)
            {
                FinalizeOpenLaps(entry, uid);
                WriteSession(uid, entry);
            }

            _sessions.Clear();
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

        var trackName = F125TrackNames.Get(session.TrackId);
        var safeName = string.Join("_", trackName.Split(Path.GetInvalidFileNameChars()));
        var now = DateTimeOffset.Now;
        var folder = $"F1{entry.GameYear}_{safeName}_{now:yyyy-MM-dd_HH-mm}";

        _weekendFolders[wid] = folder;
        entry.WeekendFolder = folder;
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
            var slug = F125SessionTypes.GetSlug(entry.SessionType);
            // Writes always target the persisted root (Settings tab), not any ephemeral
            // History "Select Folder" override that might be active for read-only browsing.
            var logsDir = Path.Combine(HistoryRoot.PersistentDefault, entry.WeekendFolder);
            Directory.CreateDirectory(logsDir);

            var filePath = Path.Combine(logsDir, $"{slug}.json");

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
                    TrackId = sessionPacket.TrackId,
                    TrackName = F125TrackNames.Get(sessionPacket.TrackId),
                    SessionType = entry.SessionType,
                    SessionTypeName = F125SessionTypes.GetName(entry.SessionType),
                    GameYear = entry.GameYear,
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
        float minX = float.MaxValue, maxX = float.MinValue;
        float minZ = float.MaxValue, maxZ = float.MinValue;
        bool any = false;

        foreach (var driver in entry.Drivers.Values)
        {
            foreach (var lap in driver.Laps)
            {
                if (lap.Motion == null) continue;
                foreach (var m in lap.Motion)
                {
                    if (m.X < minX) minX = m.X;
                    if (m.X > maxX) maxX = m.X;
                    if (m.Z < minZ) minZ = m.Z;
                    if (m.Z > maxZ) maxZ = m.Z;
                    any = true;
                }
            }
        }

        return any ? new TrackBounds { MinX = minX, MaxX = maxX, MinZ = minZ, MaxZ = maxZ } : null;
    }

    private sealed class SessionEntry
    {
        public byte PlayerCarIndex { get; set; }
        public byte GameYear { get; set; }
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

        // Live race-control state. Applied to each newly completed lap.
        public RaceFlag CurrentRaceFlag = RaceFlag.Green;
        /// <summary>Highest flag seen during the current lap per car (gets stamped at lap completion).</summary>
        public readonly RaceFlag[] LapMaxFlag = new RaceFlag[MaxCars];
        /// <summary>Per-car latch: set true when CarStatusPacket.VehicleFiaFlags == 2 (blue) is
        /// seen at any frame during the current lap. Cleared at lap completion.</summary>
        public readonly bool[] LapBlueFlag = new bool[MaxCars];
    }

}
