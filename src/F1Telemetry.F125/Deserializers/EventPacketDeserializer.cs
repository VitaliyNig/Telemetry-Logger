using System.Text;
using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class EventPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.Event;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        // 4-char ASCII code read directly from the span — no intermediate byte[].
        var eventCode = Encoding.ASCII.GetString(data.Slice(reader.Offset, 4));
        reader.Skip(4);

        var packet = new EventPacket { EventCode = eventCode };

        packet.Details = eventCode switch
        {
            "FTLP" => new FastestLapEvent
            {
                VehicleIdx = reader.ReadByte(),
                LapTime = reader.ReadFloat(),
            },
            "RTMT" => new RetirementEvent
            {
                VehicleIdx = reader.ReadByte(),
                Reason = reader.ReadByte(),
            },
            "DRSD" => new DrsDisabledEvent
            {
                Reason = reader.ReadByte(),
            },
            "TMPT" => new TeamMateInPitsEvent
            {
                VehicleIdx = reader.ReadByte(),
            },
            "RCWN" => new RaceWinnerEvent
            {
                VehicleIdx = reader.ReadByte(),
            },
            "PENA" => new PenaltyEvent
            {
                PenaltyType = reader.ReadByte(),
                InfringementType = reader.ReadByte(),
                VehicleIdx = reader.ReadByte(),
                OtherVehicleIdx = reader.ReadByte(),
                Time = reader.ReadByte(),
                LapNum = reader.ReadByte(),
                PlacesGained = reader.ReadByte(),
            },
            "SPTP" => new SpeedTrapEvent
            {
                VehicleIdx = reader.ReadByte(),
                Speed = reader.ReadFloat(),
                IsOverallFastestInSession = reader.ReadByte(),
                IsDriverFastestInSession = reader.ReadByte(),
                FastestVehicleIdxInSession = reader.ReadByte(),
                FastestSpeedInSession = reader.ReadFloat(),
            },
            "STLG" => new StartLightsEvent
            {
                NumLights = reader.ReadByte(),
            },
            "DTSV" => new DriveThroughPenaltyServedEvent
            {
                VehicleIdx = reader.ReadByte(),
            },
            "SGSV" => new StopGoPenaltyServedEvent
            {
                VehicleIdx = reader.ReadByte(),
                StopTime = reader.ReadFloat(),
            },
            "FLBK" => new FlashbackEvent
            {
                FlashbackFrameIdentifier = reader.ReadUInt32(),
                FlashbackSessionTime = reader.ReadFloat(),
            },
            "BUTN" => new ButtonsEvent
            {
                ButtonStatus = reader.ReadUInt32(),
            },
            "OVTK" => new OvertakeEvent
            {
                OvertakingVehicleIdx = reader.ReadByte(),
                BeingOvertakenVehicleIdx = reader.ReadByte(),
            },
            "SCAR" => new SafetyCarEvent
            {
                SafetyCarType = reader.ReadByte(),
                EventType = reader.ReadByte(),
            },
            "COLL" => new CollisionEvent
            {
                Vehicle1Idx = reader.ReadByte(),
                Vehicle2Idx = reader.ReadByte(),
            },
            _ => null, // SSTA, SEND, DRSE, CHQF, LGOT, RDFL have no extra data
        };

        return packet;
    }
}
