using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2025.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2025.Deserializers;

public sealed class LapPositionsPacketDeserializer : IPacketDeserializer
{
    private const int MaxLaps = 50;

    public byte PacketId => (byte)F1PacketId.LapPositions;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, PacketHeaderReader.HeaderSize);
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
