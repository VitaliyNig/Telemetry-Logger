namespace F1Telemetry.Packets;

public sealed class LapPositionsPacket
{
    public byte NumLaps { get; set; }
    public byte LapStart { get; set; }
    public int[][] PositionForVehicleIdx { get; set; } = [];
}
