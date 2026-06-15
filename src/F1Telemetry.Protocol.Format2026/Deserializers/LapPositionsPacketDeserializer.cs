using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

internal sealed class LapPositionsPacketDeserializer : IPacketDeserializer
{
    private const int MaxLaps = 50;

    public byte PacketId => (byte)F1PacketId.LapPositions;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new LapPositionsPacket
        {
            NumLaps = reader.ReadByte(),
            LapStart = reader.ReadByte(),
            PositionForVehicleIdx = new int[MaxLaps][]
        };

        for (var i = 0; i < MaxLaps; i++)
            packet.PositionForVehicleIdx[i] = reader.ReadByteValuesAsIntArray(Format2026Constants.MaxCarsInUdpData);

        return packet;
    }
}
