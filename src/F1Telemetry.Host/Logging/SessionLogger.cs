using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Host.Serialization;
using F1Telemetry.State;
using F1Telemetry.Telemetry;
using Microsoft.Extensions.Logging;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Accumulates telemetry data per session and writes to JSON files in the Logs/ folder.
/// Flushes on session end (SEND event) and on app shutdown as a safety net.
/// Sessions belonging to the same weekend (same WeekendLinkIdentifier) share a folder.
/// </summary>
public sealed class SessionLogger
{
    private readonly LapSetupStore _lapSetupStore;
    private readonly ILogger<SessionLogger> _logger;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>Packet types to skip — high-frequency physics data not useful as a snapshot.</summary>
    private static readonly HashSet<byte> IgnoredPackets = new()
    {
        (byte)F125PacketId.Motion,
        (byte)F125PacketId.MotionEx,
    };

    private readonly object _lock = new();

    /// <summary>All accumulated sessions keyed by sessionUid.</summary>
    private readonly Dictionary<ulong, SessionEntry> _sessions = new();

    /// <summary>Weekend folder names keyed by weekendLinkId.</summary>
    private readonly Dictionary<uint, string> _weekendFolders = new();

    private ulong _currentSessionUid;

    public SessionLogger(LapSetupStore lapSetupStore, ILogger<SessionLogger> logger)
    {
        _lapSetupStore = lapSetupStore;
        _logger = logger;
    }

    public void ProcessPacket(TelemetryPacketHeader header, byte packetId, object data)
    {
        if (IgnoredPackets.Contains(packetId))
            return;

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

            // Accumulated data — append/merge rather than overwrite
            switch (data)
            {
                case SessionPacket session:
                    entry.SessionType = session.SessionType;
                    ResolveWeekendFolder(entry, session);
                    break;
                case SessionHistoryPacket history:
                    entry.LapHistories[history.CarIdx] = history;
                    break;
                case EventPacket evt:
                    entry.Events.Add(new SessionLogEvent
                    {
                        SessionTime = header.SessionTime,
                        EventCode = evt.EventCode,
                        Details = evt.Details,
                    });
                    if (evt.EventCode == "SEND")
                    {
                        WriteSession(uid, entry);
                        _sessions.Remove(uid);
                        return;
                    }
                    break;
            }

            // Latest snapshot of every packet type (overwrites previous)
            var name = F125PacketNames.Get(packetId);
            entry.LatestPackets[name] = data;
        }
    }

    /// <summary>Flush any remaining sessions to disk. Safety net for app shutdown.</summary>
    public void Flush()
    {
        lock (_lock)
        {
            foreach (var (uid, entry) in _sessions)
                WriteSession(uid, entry);

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
            var logsDir = Path.Combine(AppContext.BaseDirectory, "Logs", entry.WeekendFolder);
            Directory.CreateDirectory(logsDir);

            var filePath = Path.Combine(logsDir, $"{slug}.json");

            // Gather setup snapshots for the player car
            Dictionary<int, object>? setupSnapshots = null;
            if (uid == _currentSessionUid)
            {
                var snapshots = _lapSetupStore.GetSnapshots(entry.PlayerCarIndex);
                if (snapshots != null && snapshots.Count > 0)
                    setupSnapshots = new Dictionary<int, object>(snapshots);
            }

            var logData = new SessionLogData
            {
                Meta = new SessionLogMeta
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
                },
                Packets = new Dictionary<string, object>(entry.LatestPackets),
                LapHistories = entry.LapHistories.Count > 0
                    ? new Dictionary<int, SessionHistoryPacket>(entry.LapHistories)
                    : null,
                Events = entry.Events.Count > 0
                    ? new List<SessionLogEvent>(entry.Events)
                    : null,
                SetupSnapshots = setupSnapshots,
            };

            var json = JsonSerializer.Serialize(logData, JsonOptions);
            File.WriteAllText(filePath, json);

            _logger.LogInformation("Session saved to {FilePath}", filePath);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to save session log");
        }
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

        /// <summary>All events in order.</summary>
        public List<SessionLogEvent> Events { get; } = new();
    }

    private sealed class SessionLogData
    {
        public SessionLogMeta? Meta { get; set; }

        /// <summary>Latest snapshot of every packet type (Session, LapData, CarTelemetry, CarStatus, CarDamage, CarSetups, TyreSets, Participants, FinalClassification, TimeTrial, LapPositions, LobbyInfo).</summary>
        public Dictionary<string, object>? Packets { get; set; }

        /// <summary>Full lap history per car (key = carIdx).</summary>
        public Dictionary<int, SessionHistoryPacket>? LapHistories { get; set; }

        /// <summary>All session events in chronological order.</summary>
        public List<SessionLogEvent>? Events { get; set; }

        /// <summary>Per-lap setup snapshots for the player car (key = lapIndex).</summary>
        public Dictionary<int, object>? SetupSnapshots { get; set; }
    }

    private sealed class SessionLogMeta
    {
        public int TrackId { get; set; }
        public string TrackName { get; set; } = "";
        public byte SessionType { get; set; }
        public string SessionTypeName { get; set; } = "";
        public byte GameYear { get; set; }
        public uint WeekendLinkId { get; set; }
        public uint SessionLinkId { get; set; }
        public byte PlayerCarIndex { get; set; }
        public DateTimeOffset SavedAt { get; set; }
    }

    private sealed class SessionLogEvent
    {
        public float SessionTime { get; set; }
        public string EventCode { get; set; } = "";
        public object? Details { get; set; }
    }
}
