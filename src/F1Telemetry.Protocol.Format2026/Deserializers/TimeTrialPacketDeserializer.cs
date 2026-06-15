using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>Time Trial packet for format 2026. <c>m_teamId</c> widened to uint16.</summary>
internal sealed class TimeTrialPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.TimeTrial;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        return new TimeTrialPacket
        {
            PlayerSessionBestDataSet = ReadDataSet(ref reader),
            PersonalBestDataSet = ReadDataSet(ref reader),
            RivalDataSet = ReadDataSet(ref reader),
        };
    }

    private static TimeTrialDataSet ReadDataSet(ref BinaryReader126 reader)
    {
        return new TimeTrialDataSet
        {
            CarIdx = reader.ReadByte(),
            TeamId = reader.ReadUInt16(),
            LapTimeInMs = reader.ReadUInt32(),
            Sector1TimeInMs = reader.ReadUInt32(),
            Sector2TimeInMs = reader.ReadUInt32(),
            Sector3TimeInMs = reader.ReadUInt32(),
            TractionControl = reader.ReadByte(),
            GearboxAssist = reader.ReadByte(),
            AntiLockBrakes = reader.ReadByte(),
            EqualCarPerformance = reader.ReadByte(),
            CustomSetup = reader.ReadByte(),
            Valid = reader.ReadByte(),
        };
    }
}
