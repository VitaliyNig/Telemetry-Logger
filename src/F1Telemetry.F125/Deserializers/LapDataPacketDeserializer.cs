using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class LapDataPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.LapData;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new LapDataPacket
        {
            LapDataItems = new LapData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.LapDataItems[i] = new LapData
            {
                LastLapTimeInMs = reader.ReadUInt32(),
                CurrentLapTimeInMs = reader.ReadUInt32(),
                Sector1TimeMsPart = reader.ReadUInt16(),
                Sector1TimeMinutesPart = reader.ReadByte(),
                Sector2TimeMsPart = reader.ReadUInt16(),
                Sector2TimeMinutesPart = reader.ReadByte(),
                DeltaToCarInFrontMsPart = reader.ReadUInt16(),
                DeltaToCarInFrontMinutesPart = reader.ReadByte(),
                DeltaToRaceLeaderMsPart = reader.ReadUInt16(),
                DeltaToRaceLeaderMinutesPart = reader.ReadByte(),
                LapDistance = reader.ReadFloat(),
                TotalDistance = reader.ReadFloat(),
                SafetyCarDelta = reader.ReadFloat(),
                CarPosition = reader.ReadByte(),
                CurrentLapNum = reader.ReadByte(),
                PitStatus = reader.ReadByte(),
                NumPitStops = reader.ReadByte(),
                Sector = reader.ReadByte(),
                CurrentLapInvalid = reader.ReadByte(),
                Penalties = reader.ReadByte(),
                TotalWarnings = reader.ReadByte(),
                CornerCuttingWarnings = reader.ReadByte(),
                NumUnservedDriveThroughPens = reader.ReadByte(),
                NumUnservedStopGoPens = reader.ReadByte(),
                GridPosition = reader.ReadByte(),
                DriverStatus = reader.ReadByte(),
                ResultStatus = reader.ReadByte(),
                PitLaneTimerActive = reader.ReadByte(),
                PitLaneTimeInLaneInMs = reader.ReadUInt16(),
                PitStopTimerInMs = reader.ReadUInt16(),
                PitStopShouldServePen = reader.ReadByte(),
                SpeedTrapFastestSpeed = reader.ReadFloat(),
                SpeedTrapFastestLap = reader.ReadByte(),
            };
        }

        packet.TimeTrialPbCarIdx = reader.ReadByte();
        packet.TimeTrialRivalCarIdx = reader.ReadByte();

        return packet;
    }
}
