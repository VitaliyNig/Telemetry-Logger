using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// Participants packet for format 2026. DriverId / NetworkId / TeamId widened from uint8
/// to uint16 to accommodate the larger team / driver database.
/// </summary>
internal sealed class ParticipantsPacketDeserializer : IPacketDeserializer
{
    private const int MaxParticipantNameLen = 32;

    public byte PacketId => (byte)F1PacketId.Participants;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new ParticipantsPacket
        {
            NumActiveCars = reader.ReadByte(),
            Participants = new ParticipantData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.Participants[i] = new ParticipantData
            {
                AiControlled = reader.ReadByte(),
                DriverId = reader.ReadUInt16(),
                NetworkId = reader.ReadUInt16(),
                TeamId = reader.ReadUInt16(),
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
