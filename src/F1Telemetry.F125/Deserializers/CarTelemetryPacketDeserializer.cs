using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarTelemetryPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarTelemetry;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetryPacket
        {
            CarTelemetryData = new CarTelemetryData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
        {
            packet.CarTelemetryData[i] = new CarTelemetryData
            {
                Speed = reader.ReadUInt16(),
                Throttle = reader.ReadFloat(),
                Steer = reader.ReadFloat(),
                Brake = reader.ReadFloat(),
                Clutch = reader.ReadByte(),
                Gear = reader.ReadSByte(),
                EngineRpm = reader.ReadUInt16(),
                Drs = reader.ReadByte(),
                RevLightsPercent = reader.ReadByte(),
                RevLightsBitValue = reader.ReadUInt16(),
                BrakesTemperature = reader.ReadUInt16Array(4),
                TyresSurfaceTemperature = reader.ReadByteArray(4),
                TyresInnerTemperature = reader.ReadByteArray(4),
                EngineTemperature = reader.ReadUInt16(),
                TyresPressure = reader.ReadFloatArray(4),
                SurfaceType = reader.ReadByteArray(4),
            };
        }

        packet.MfdPanelIndex = reader.ReadByte();
        packet.MfdPanelIndexSecondaryPlayer = reader.ReadByte();
        packet.SuggestedGear = reader.ReadSByte();

        return packet;
    }
}
