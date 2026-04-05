using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class TimeTrialPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.TimeTrial;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        return new TimeTrialPacket
        {
            PlayerSessionBestDataSet = ReadDataSet(ref reader),
            PersonalBestDataSet = ReadDataSet(ref reader),
            RivalDataSet = ReadDataSet(ref reader),
        };
    }

    private static TimeTrialDataSet ReadDataSet(ref BinaryReader125 reader)
    {
        return new TimeTrialDataSet
        {
            CarIdx = reader.ReadByte(),
            TeamId = reader.ReadByte(),
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
