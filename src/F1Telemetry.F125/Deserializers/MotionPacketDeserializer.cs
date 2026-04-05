using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class MotionPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.Motion;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new MotionPacket
        {
            CarMotionData = new CarMotionData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
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
                GForceLateral = reader.ReadFloat(),
                GForceLongitudinal = reader.ReadFloat(),
                GForceVertical = reader.ReadFloat(),
                Yaw = reader.ReadFloat(),
                Pitch = reader.ReadFloat(),
                Roll = reader.ReadFloat(),
            };
        }

        return packet;
    }
}
