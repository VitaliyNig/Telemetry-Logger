using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarDamagePacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarDamage;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarDamagePacket
        {
            CarDamageDataItems = new CarDamageData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.CarDamageDataItems[i] = new CarDamageData
            {
                TyresWear = reader.ReadFloatArray(4),
                TyresDamage = reader.ReadByteValuesAsIntArray(4),
                BrakesDamage = reader.ReadByteValuesAsIntArray(4),
                TyreBlisters = reader.ReadByteValuesAsIntArray(4),
                FrontLeftWingDamage = reader.ReadByte(),
                FrontRightWingDamage = reader.ReadByte(),
                RearWingDamage = reader.ReadByte(),
                FloorDamage = reader.ReadByte(),
                DiffuserDamage = reader.ReadByte(),
                SidepodDamage = reader.ReadByte(),
                DrsFault = reader.ReadByte(),
                ErsFault = reader.ReadByte(),
                GearBoxDamage = reader.ReadByte(),
                EngineDamage = reader.ReadByte(),
                EngineMguhWear = reader.ReadByte(),
                EngineEsWear = reader.ReadByte(),
                EngineCeWear = reader.ReadByte(),
                EngineIceWear = reader.ReadByte(),
                EngineMgukWear = reader.ReadByte(),
                EngineTcWear = reader.ReadByte(),
                EngineBlown = reader.ReadByte(),
                EngineSeized = reader.ReadByte(),
            };
        }

        return packet;
    }
}
