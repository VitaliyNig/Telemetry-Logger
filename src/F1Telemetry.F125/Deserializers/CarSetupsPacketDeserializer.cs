using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarSetupsPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarSetups;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarSetupsPacket
        {
            CarSetupData = new CarSetupData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.CarSetupData[i] = new CarSetupData
            {
                FrontWing = reader.ReadByte(),
                RearWing = reader.ReadByte(),
                OnThrottle = reader.ReadByte(),
                OffThrottle = reader.ReadByte(),
                FrontCamber = reader.ReadFloat(),
                RearCamber = reader.ReadFloat(),
                FrontToe = reader.ReadFloat(),
                RearToe = reader.ReadFloat(),
                FrontSuspension = reader.ReadByte(),
                RearSuspension = reader.ReadByte(),
                FrontAntiRollBar = reader.ReadByte(),
                RearAntiRollBar = reader.ReadByte(),
                FrontSuspensionHeight = reader.ReadByte(),
                RearSuspensionHeight = reader.ReadByte(),
                BrakePressure = reader.ReadByte(),
                BrakeBias = reader.ReadByte(),
                EngineBraking = reader.ReadByte(),
                RearLeftTyrePressure = reader.ReadFloat(),
                RearRightTyrePressure = reader.ReadFloat(),
                FrontLeftTyrePressure = reader.ReadFloat(),
                FrontRightTyrePressure = reader.ReadFloat(),
                Ballast = reader.ReadByte(),
                FuelLoad = reader.ReadFloat(),
            };
        }

        packet.NextFrontWingValue = reader.ReadFloat();
        return packet;
    }
}
