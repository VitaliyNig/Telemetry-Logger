using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// New packet in format 2026 (id 16, named CarTelemetry26 after the introduction year):
/// Active Aero mode + availability + activation distance, Overtake mode availability +
/// state + activation distance, "2026 regulations" flag, and a wrong-way driving flag —
/// one record per car, 24 cars.
/// </summary>
internal sealed class CarTelemetry26PacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.CarTelemetry26;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetry26Packet
        {
            CarTelemetry26DataItems = new CarTelemetry26Data[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
        {
            packet.CarTelemetry26DataItems[i] = new CarTelemetry26Data
            {
                ActiveAeroMode = reader.ReadByte(),
                ActiveAeroAvailable = reader.ReadByte(),
                ActiveAeroActivationDistance = reader.ReadUInt16(),
                OvertakeAvailable = reader.ReadByte(),
                OvertakeActive = reader.ReadByte(),
                OvertakeActivationDistance = reader.ReadUInt16(),
                Regulations2026 = reader.ReadByte(),
                DrivingWrongWay = reader.ReadByte(),
            };
        }

        return packet;
    }
}
