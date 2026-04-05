using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class ParticipantsPacketDeserializer : IPacketDeserializer
{
    private const int MaxParticipantNameLen = 32;

    public byte PacketId => (byte)F125PacketId.Participants;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new ParticipantsPacket
        {
            NumActiveCars = reader.ReadByte(),
            Participants = new ParticipantData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.Participants[i] = new ParticipantData
            {
                AiControlled = reader.ReadByte(),
                DriverId = reader.ReadByte(),
                NetworkId = reader.ReadByte(),
                TeamId = reader.ReadByte(),
                MyTeam = reader.ReadByte(),
                RaceNumber = reader.ReadByte(),
                Nationality = reader.ReadByte(),
                Name = reader.ReadString(MaxParticipantNameLen),
                YourTelemetry = reader.ReadByte(),
                ShowOnlineNames = reader.ReadByte(),
                TechLevel = reader.ReadUInt16(),
                Platform = reader.ReadByte(),
                NumColours = reader.ReadByte(),
            };

            var colours = new LiveryColour[4];
            for (var c = 0; c < 4; c++)
            {
                colours[c] = new LiveryColour
                {
                    Red = reader.ReadByte(),
                    Green = reader.ReadByte(),
                    Blue = reader.ReadByte(),
                };
            }
            packet.Participants[i].LiveryColours = colours;
        }

        return packet;
    }
}
