using F1Telemetry.F125.Packets;

namespace F1Telemetry.Host.Logging;

// Session log schema v2. v1 stored only the latest packet snapshot per type, no motion traces,
// and no per-lap tyre snapshots for non-player cars — insufficient for History mode's Telemetry
// Compare / Positions / Track Map views. v2 adds per-driver per-lap sample streams
// (throttle/brake/speed/steering/gear/RPM at 20 Hz, world X/Z at 10 Hz) plus per-lap tyre state
// for all 22 cars.

/// <summary>One 20 Hz telemetry sample. Compact field names so each sample is ~50 bytes JSON.</summary>
public sealed class LapSample
{
    /// <summary>Seconds since lap start.</summary>
    public float T { get; set; }
    /// <summary>Lap distance in metres.</summary>
    public float D { get; set; }
    /// <summary>Speed in km/h.</summary>
    public ushort Spd { get; set; }
    /// <summary>Throttle 0..100.</summary>
    public byte Thr { get; set; }
    /// <summary>Brake 0..100.</summary>
    public byte Brk { get; set; }
    /// <summary>Steering −100..100 (negative = left).</summary>
    public sbyte Str { get; set; }
    /// <summary>Gear −1..8 (−1 reverse, 0 neutral).</summary>
    public sbyte Gr { get; set; }
    /// <summary>Engine RPM.</summary>
    public ushort Rpm { get; set; }
    /// <summary>Sector 0..2.</summary>
    public byte Sec { get; set; }
    /// <summary>ERS store 0..100 (% of 4 MJ capacity).</summary>
    public byte Ers { get; set; }
    /// <summary>ERS deploy mode 0=None 1=Medium 2=Hotlap 3=Overtake.</summary>
    public byte ErsMd { get; set; }
    /// <summary>DRS 0 off, 1 active.</summary>
    public byte Drs { get; set; }
}

/// <summary>One 10 Hz world-position sample for track-map trajectories.</summary>
public sealed class MotionSample
{
    public float T { get; set; }
    public float D { get; set; }
    public float X { get; set; }
    public float Z { get; set; }
}

/// <summary>Per-lap tyre snapshot captured at the moment the lap completes. Applies to all 22 cars in v2.</summary>
public sealed class LapTyreSnapshotV2
{
    public byte Act { get; set; }
    public byte Vis { get; set; }
    public byte Age { get; set; }
    public float[] Wear { get; set; } = new float[4];
}

/// <summary>Race-control flag state for a lap. Priority Red > SC > VSC > Yellow > Green.</summary>
public enum RaceFlag : byte
{
    Green = 0,
    Yellow = 1,
    Sc = 2,
    Vsc = 3,
    Red = 4,
}

/// <summary>One completed lap for one car. Samples/Motion are lazily set to null in RAM after a partial flush to disk.</summary>
public sealed class DriverLap
{
    public byte LapNum { get; set; }
    public uint LapTimeMs { get; set; }
    public uint S1Ms { get; set; }
    public uint S2Ms { get; set; }
    public uint S3Ms { get; set; }
    public byte CompoundActual { get; set; }
    public byte CompoundVisual { get; set; }
    public byte TyreAge { get; set; }
    public float[] TyreWearEnd { get; set; } = new float[4];
    public bool Valid { get; set; }
    public bool Pit { get; set; }
    /// <summary>Latched during the lap: true if CarStatusPacket.VehicleFiaFlags == 2 (blue) at any frame.</summary>
    public bool BlueFlag { get; set; }
    public byte Position { get; set; }
    public int? GapToLeaderMs { get; set; }
    public RaceFlag? RaceFlag { get; set; }
    public List<LapSample>? Samples { get; set; }
    public List<MotionSample>? Motion { get; set; }
}

/// <summary>All data for one car over the whole session.</summary>
public sealed class DriverSessionData
{
    public byte CarIdx { get; set; }
    public byte TeamId { get; set; }
    public byte DriverId { get; set; }
    public string Name { get; set; } = "";
    public List<DriverLap> Laps { get; set; } = new();
    /// <summary>Tyre snapshots keyed by completed lap index (0-based).</summary>
    public Dictionary<int, LapTyreSnapshotV2> TyreByLap { get; set; } = new();
    /// <summary>Per-lap setup snapshot, populated for the player car only (practice / time trial).</summary>
    public Dictionary<int, CarSetupData>? SetupByLap { get; set; }
}

/// <summary>Session log metadata.</summary>
public sealed class SessionLogMetaV2
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
    public float TrackLengthM { get; set; }
    public byte TotalLaps { get; set; }
    public float Sector2StartM { get; set; }
    public float Sector3StartM { get; set; }
    /// <summary>World X/Z bounds of the recorded motion. Used to normalize trajectories into the SVG viewBox.</summary>
    public TrackBounds? TrackBoundsXZ { get; set; }
}

public sealed class TrackBounds
{
    public float MinX { get; set; }
    public float MaxX { get; set; }
    public float MinZ { get; set; }
    public float MaxZ { get; set; }
}

/// <summary>v2 event row. Adds `lap`, `carIdx`, and a flag-type for race-control correlation.</summary>
public sealed class SessionLogEventV2
{
    public float TimeS { get; set; }
    public string Code { get; set; } = "";
    public byte? Lap { get; set; }
    public byte? CarIdx { get; set; }
    /// <summary>For safety-car / red-flag events only. 0=Green,1=Yellow,2=SC,3=VSC,4=Red.</summary>
    public RaceFlag? Flag { get; set; }
    public object? Details { get; set; }
}

/// <summary>Top-level session log file (schema v2).</summary>
public sealed class SessionLogDataV2
{
    public SessionLogMetaV2? Meta { get; set; }

    /// <summary>Latest snapshot of each packet type (kept for cheap /api/state fallback and cross-check).</summary>
    public Dictionary<string, object>? Packets { get; set; }

    /// <summary>Per-car lap-and-sample data.</summary>
    public Dictionary<int, DriverSessionData>? Drivers { get; set; }

    /// <summary>Per-car session-history packet (authoritative lap times + tyre stints).</summary>
    public Dictionary<int, SessionHistoryPacket>? LapHistories { get; set; }

    public List<SessionLogEventV2>? Events { get; set; }

    /// <summary>Pulled from the final snapshot of the FinalClassification packet on SEND.</summary>
    public object? FinalClassification { get; set; }
}
