using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

internal sealed class CarDamagePacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.CarDamage;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new CarDamagePacket
        {
            CarDamageDataItems = new CarDamageData[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
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
