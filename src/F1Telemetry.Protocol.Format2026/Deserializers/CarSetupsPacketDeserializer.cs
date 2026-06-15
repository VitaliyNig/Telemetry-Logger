using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

internal sealed class CarSetupsPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.CarSetups;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new CarSetupsPacket
        {
            CarSetupData = new CarSetupData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
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
