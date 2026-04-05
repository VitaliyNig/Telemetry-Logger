namespace F1Telemetry.F125.Packets;

public sealed class TyreSetData
{
    public byte ActualTyreCompound { get; set; }
    public byte VisualTyreCompound { get; set; }
    public byte Wear { get; set; }
    public byte Available { get; set; }
    public byte RecommendedSession { get; set; }
    public byte LifeSpan { get; set; }
    public byte UsableLife { get; set; }
    public short LapDeltaTime { get; set; }
    public byte Fitted { get; set; }
}

public sealed class TyreSetsPacket
{
    public byte CarIdx { get; set; }
    public TyreSetData[] TyreSetDataItems { get; set; } = [];
    public byte FittedIdx { get; set; }
}
