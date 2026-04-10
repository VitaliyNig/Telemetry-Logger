using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class LapPositionsPacketDeserializer : IPacketDeserializer
{
    private const int MaxLaps = 50;

    public byte PacketId => (byte)F125PacketId.LapPositions;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new LapPositionsPacket
        {
            NumLaps = reader.ReadByte(),
            LapStart = reader.ReadByte(),
            PositionForVehicleIdx = new int[MaxLaps][]
        };

        for (var i = 0; i < MaxLaps; i++)
            packet.PositionForVehicleIdx[i] = reader.ReadByteValuesAsIntArray(F125Constants.MaxCarsInUdpData);

        return packet;
    }
}
