using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class TyreSetsPacketDeserializer : IPacketDeserializer
{
    private const int MaxNumTyreSets = 20; // 13 slick + 7 wet

    public byte PacketId => (byte)F125PacketId.TyreSets;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new TyreSetsPacket
        {
            CarIdx = reader.ReadByte(),
            TyreSetDataItems = new TyreSetData[MaxNumTyreSets]
        };

        for (var i = 0; i < MaxNumTyreSets; i++)
        {
            packet.TyreSetDataItems[i] = new TyreSetData
            {
                ActualTyreCompound = reader.ReadByte(),
                VisualTyreCompound = reader.ReadByte(),
                Wear = reader.ReadByte(),
                Available = reader.ReadByte(),
                RecommendedSession = reader.ReadByte(),
                LifeSpan = reader.ReadByte(),
                UsableLife = reader.ReadByte(),
                LapDeltaTime = reader.ReadInt16(),
                Fitted = reader.ReadByte(),
            };
        }

        packet.FittedIdx = reader.ReadByte();
        return packet;
    }
}
