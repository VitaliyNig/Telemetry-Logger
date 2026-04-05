namespace F1Telemetry.F125.Packets;

public sealed class LapPositionsPacket
{
    public byte NumLaps { get; set; }
    public byte LapStart { get; set; }
    public byte[][] PositionForVehicleIdx { get; set; } = [];
}
