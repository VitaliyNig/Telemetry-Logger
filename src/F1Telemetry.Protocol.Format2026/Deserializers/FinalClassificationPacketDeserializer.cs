using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

internal sealed class FinalClassificationPacketDeserializer : IPacketDeserializer
{
    private const int MaxTyreStints = 8;

    public byte PacketId => (byte)F1PacketId.FinalClassification;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new FinalClassificationPacket
        {
            NumCars = reader.ReadByte(),
            ClassificationData = new FinalClassificationData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.ClassificationData[i] = new FinalClassificationData
            {
                Position = reader.ReadByte(),
                NumLaps = reader.ReadByte(),
                GridPosition = reader.ReadByte(),
                Points = reader.ReadByte(),
                NumPitStops = reader.ReadByte(),
                ResultStatus = reader.ReadByte(),
                ResultReason = reader.ReadByte(),
                BestLapTimeInMs = reader.ReadUInt32(),
                TotalRaceTime = reader.ReadDouble(),
                PenaltiesTime = reader.ReadByte(),
                NumPenalties = reader.ReadByte(),
                NumTyreStints = reader.ReadByte(),
                TyreStintsActual = reader.ReadByteValuesAsIntArray(MaxTyreStints),
                TyreStintsVisual = reader.ReadByteValuesAsIntArray(MaxTyreStints),
                TyreStintsEndLaps = reader.ReadByteValuesAsIntArray(MaxTyreStints),
            };
        }

        return packet;
    }
}
