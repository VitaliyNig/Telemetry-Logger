using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class SessionHistoryPacketDeserializer : IPacketDeserializer
{
    private const int MaxNumLapsInHistory = 100;
    private const int MaxTyreStints = 8;

    public byte PacketId => (byte)F125PacketId.SessionHistory;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new SessionHistoryPacket
        {
            CarIdx = reader.ReadByte(),
            NumLaps = reader.ReadByte(),
            NumTyreStints = reader.ReadByte(),
            BestLapTimeLapNum = reader.ReadByte(),
            BestSector1LapNum = reader.ReadByte(),
            BestSector2LapNum = reader.ReadByte(),
            BestSector3LapNum = reader.ReadByte(),
        };

        packet.LapHistoryDataItems = new LapHistoryData[MaxNumLapsInHistory];
        for (var i = 0; i < MaxNumLapsInHistory; i++)
        {
            packet.LapHistoryDataItems[i] = new LapHistoryData
            {
                LapTimeInMs = reader.ReadUInt32(),
                Sector1TimeMsPart = reader.ReadUInt16(),
                Sector1TimeMinutesPart = reader.ReadByte(),
                Sector2TimeMsPart = reader.ReadUInt16(),
                Sector2TimeMinutesPart = reader.ReadByte(),
                Sector3TimeMsPart = reader.ReadUInt16(),
                Sector3TimeMinutesPart = reader.ReadByte(),
                LapValidBitFlags = reader.ReadByte(),
            };
        }

        packet.TyreStintsHistoryData = new TyreStintHistoryData[MaxTyreStints];
        for (var i = 0; i < MaxTyreStints; i++)
        {
            packet.TyreStintsHistoryData[i] = new TyreStintHistoryData
            {
                EndLap = reader.ReadByte(),
                TyreActualCompound = reader.ReadByte(),
                TyreVisualCompound = reader.ReadByte(),
            };
        }

        return packet;
    }
}
