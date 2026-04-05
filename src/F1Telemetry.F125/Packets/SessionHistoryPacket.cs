namespace F1Telemetry.F125.Packets;

public sealed class LapHistoryData
{
    public uint LapTimeInMs { get; set; }
    public ushort Sector1TimeMsPart { get; set; }
    public byte Sector1TimeMinutesPart { get; set; }
    public ushort Sector2TimeMsPart { get; set; }
    public byte Sector2TimeMinutesPart { get; set; }
    public ushort Sector3TimeMsPart { get; set; }
    public byte Sector3TimeMinutesPart { get; set; }
    public byte LapValidBitFlags { get; set; }
}

public sealed class TyreStintHistoryData
{
    public byte EndLap { get; set; }
    public byte TyreActualCompound { get; set; }
    public byte TyreVisualCompound { get; set; }
}

public sealed class SessionHistoryPacket
{
    public byte CarIdx { get; set; }
    public byte NumLaps { get; set; }
    public byte NumTyreStints { get; set; }
    public byte BestLapTimeLapNum { get; set; }
    public byte BestSector1LapNum { get; set; }
    public byte BestSector2LapNum { get; set; }
    public byte BestSector3LapNum { get; set; }
    public LapHistoryData[] LapHistoryDataItems { get; set; } = [];
    public TyreStintHistoryData[] TyreStintsHistoryData { get; set; } = [];
}
