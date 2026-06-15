using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>Lobby info packet for format 2026. <c>m_teamId</c> widened to uint16.</summary>
internal sealed class LobbyInfoPacketDeserializer : IPacketDeserializer
{
    private const int MaxParticipantNameLen = 32;

    public byte PacketId => (byte)F1PacketId.LobbyInfo;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new LobbyInfoPacket
        {
            NumPlayers = reader.ReadByte(),
            LobbyPlayers = new LobbyInfoData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.LobbyPlayers[i] = new LobbyInfoData
            {
                AiControlled = reader.ReadByte(),
                TeamId = reader.ReadUInt16(),
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
