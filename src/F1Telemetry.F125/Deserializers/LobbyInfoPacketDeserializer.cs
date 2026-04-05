using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class LobbyInfoPacketDeserializer : IPacketDeserializer
{
    private const int MaxParticipantNameLen = 32;

    public byte PacketId => (byte)F125PacketId.LobbyInfo;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new LobbyInfoPacket
        {
            NumPlayers = reader.ReadByte(),
            LobbyPlayers = new LobbyInfoData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.LobbyPlayers[i] = new LobbyInfoData
            {
                AiControlled = reader.ReadByte(),
                TeamId = reader.ReadByte(),
                Nationality = reader.ReadByte(),
                Platform = reader.ReadByte(),
                Name = reader.ReadString(MaxParticipantNameLen),
                CarNumber = reader.ReadByte(),
                YourTelemetry = reader.ReadByte(),
                ShowOnlineNames = reader.ReadByte(),
                TechLevel = reader.ReadUInt16(),
                ReadyStatus = reader.ReadByte(),
            };
        }

        return packet;
    }
}
