namespace F1Telemetry.F125.Packets;

public sealed class FinalClassificationData
{
    public byte Position { get; set; }
    public byte NumLaps { get; set; }
    public byte GridPosition { get; set; }
    public byte Points { get; set; }
    public byte NumPitStops { get; set; }
    public byte ResultStatus { get; set; }
    public byte ResultReason { get; set; }
    public uint BestLapTimeInMs { get; set; }
    public double TotalRaceTime { get; set; }
    public byte PenaltiesTime { get; set; }
    public byte NumPenalties { get; set; }
    public byte NumTyreStints { get; set; }
    public byte[] TyreStintsActual { get; set; } = new byte[8];
    public byte[] TyreStintsVisual { get; set; } = new byte[8];
    public byte[] TyreStintsEndLaps { get; set; } = new byte[8];
}

public sealed class FinalClassificationPacket
{
    public byte NumCars { get; set; }
    public FinalClassificationData[] ClassificationData { get; set; } = [];
}
