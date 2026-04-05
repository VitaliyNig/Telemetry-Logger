namespace F1Telemetry.F125.Packets;

public sealed class LapData
{
    public uint LastLapTimeInMs { get; set; }
    public uint CurrentLapTimeInMs { get; set; }
    public ushort Sector1TimeMsPart { get; set; }
    public byte Sector1TimeMinutesPart { get; set; }
    public ushort Sector2TimeMsPart { get; set; }
    public byte Sector2TimeMinutesPart { get; set; }
    public ushort DeltaToCarInFrontMsPart { get; set; }
    public byte DeltaToCarInFrontMinutesPart { get; set; }
    public ushort DeltaToRaceLeaderMsPart { get; set; }
    public byte DeltaToRaceLeaderMinutesPart { get; set; }
    public float LapDistance { get; set; }
    public float TotalDistance { get; set; }
    public float SafetyCarDelta { get; set; }
    public byte CarPosition { get; set; }
    public byte CurrentLapNum { get; set; }
    public byte PitStatus { get; set; }
    public byte NumPitStops { get; set; }
    public byte Sector { get; set; }
    public byte CurrentLapInvalid { get; set; }
    public byte Penalties { get; set; }
    public byte TotalWarnings { get; set; }
    public byte CornerCuttingWarnings { get; set; }
    public byte NumUnservedDriveThroughPens { get; set; }
    public byte NumUnservedStopGoPens { get; set; }
    public byte GridPosition { get; set; }
    public byte DriverStatus { get; set; }
    public byte ResultStatus { get; set; }
    public byte PitLaneTimerActive { get; set; }
    public ushort PitLaneTimeInLaneInMs { get; set; }
    public ushort PitStopTimerInMs { get; set; }
    public byte PitStopShouldServePen { get; set; }
    public float SpeedTrapFastestSpeed { get; set; }
    public byte SpeedTrapFastestLap { get; set; }
}

public sealed class LapDataPacket
{
    public LapData[] LapDataItems { get; set; } = [];
    public byte TimeTrialPbCarIdx { get; set; }
    public byte TimeTrialRivalCarIdx { get; set; }
}
