using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// Motion packet for format 2026. Two wire-level changes vs 2025:
/// - Per-car array length is 24 (was 22).
/// - G-force components are int16 quantised: divide by 1000.0f to recover the original float.
/// </summary>
internal sealed class MotionPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.Motion;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new MotionPacket
        {
            CarMotionData = new CarMotionData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.CarMotionData[i] = new CarMotionData
            {
                WorldPositionX = reader.ReadFloat(),
                WorldPositionY = reader.ReadFloat(),
                WorldPositionZ = reader.ReadFloat(),
                WorldVelocityX = reader.ReadFloat(),
                WorldVelocityY = reader.ReadFloat(),
                WorldVelocityZ = reader.ReadFloat(),
                WorldForwardDirX = reader.ReadInt16(),
                WorldForwardDirY = reader.ReadInt16(),
                WorldForwardDirZ = reader.ReadInt16(),
                WorldRightDirX = reader.ReadInt16(),
                WorldRightDirY = reader.ReadInt16(),
                WorldRightDirZ = reader.ReadInt16(),
                GForceLateral = reader.ReadInt16() / 1000f,
                GForceLongitudinal = reader.ReadInt16() / 1000f,
                GForceVertical = reader.ReadInt16() / 1000f,
                Yaw = reader.ReadFloat(),
                Pitch = reader.ReadFloat(),
                Roll = reader.ReadFloat(),
            };
        }

        return packet;
    }
}
