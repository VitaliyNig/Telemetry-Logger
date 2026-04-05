using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class MotionExPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.MotionEx;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        return new MotionExPacket
        {
            SuspensionPosition = reader.ReadFloatArray(4),
            SuspensionVelocity = reader.ReadFloatArray(4),
            SuspensionAcceleration = reader.ReadFloatArray(4),
            WheelSpeed = reader.ReadFloatArray(4),
            WheelSlipRatio = reader.ReadFloatArray(4),
            WheelSlipAngle = reader.ReadFloatArray(4),
            WheelLatForce = reader.ReadFloatArray(4),
            WheelLongForce = reader.ReadFloatArray(4),
            HeightOfCogAboveGround = reader.ReadFloat(),
            LocalVelocityX = reader.ReadFloat(),
            LocalVelocityY = reader.ReadFloat(),
            LocalVelocityZ = reader.ReadFloat(),
            AngularVelocityX = reader.ReadFloat(),
            AngularVelocityY = reader.ReadFloat(),
            AngularVelocityZ = reader.ReadFloat(),
            AngularAccelerationX = reader.ReadFloat(),
            AngularAccelerationY = reader.ReadFloat(),
            AngularAccelerationZ = reader.ReadFloat(),
            FrontWheelsAngle = reader.ReadFloat(),
            WheelVertForce = reader.ReadFloatArray(4),
            FrontAeroHeight = reader.ReadFloat(),
            RearAeroHeight = reader.ReadFloat(),
            FrontRollAngle = reader.ReadFloat(),
            RearRollAngle = reader.ReadFloat(),
            ChassisYaw = reader.ReadFloat(),
            ChassisPitch = reader.ReadFloat(),
            WheelCamber = reader.ReadFloatArray(4),
            WheelCamberGain = reader.ReadFloatArray(4),
        };
    }
}
