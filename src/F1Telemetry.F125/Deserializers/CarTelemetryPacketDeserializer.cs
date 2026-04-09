using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarTelemetryPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarTelemetry;

    /// <summary>Per-car size when tyre temps are uint8[4] each (official F1 25 struct in docs/).</summary>
    private const int CarRecordBytesTyreTempUInt8 = 60;

    /// <summary>Per-car size when tyre temps are uint16[4] each (some game builds / packet versions).</summary>
    private const int CarRecordBytesTyreTempUInt16 = 68;

    private const int TrailerAfterCars = 3; // mfd + mfd secondary + suggested gear

    private static ushort[] ReadTyreTemperaturesAsUInt8(BinaryReader125 reader)
    {
        var bytes = reader.ReadByteArray(4);
        return [bytes[0], bytes[1], bytes[2], bytes[3]];
    }

    private static CarTelemetryData ReadOneCar(BinaryReader125 reader, bool tyreTempsUInt16)
    {
        var car = new CarTelemetryData
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
            TyresSurfaceTemperature = tyreTempsUInt16
                ? reader.ReadUInt16Array(4)
                : ReadTyreTemperaturesAsUInt8(reader),
            TyresInnerTemperature = tyreTempsUInt16
                ? reader.ReadUInt16Array(4)
                : ReadTyreTemperaturesAsUInt8(reader),
            EngineTemperature = reader.ReadUInt16(),
            TyresPressure = reader.ReadFloatArray(4),
            SurfaceType = reader.ReadByteArray(4),
        };
        return car;
    }

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var payloadLen = data.Length - F125PacketHeaderReader.HeaderSize;
        var cars = F125Constants.MaxCarsInUdpData;
        var bodyLen = payloadLen - TrailerAfterCars;
        if (bodyLen < cars * CarRecordBytesTyreTempUInt8)
            return null;

        var perCar = bodyLen / cars;
        var remainder = bodyLen % cars;
        if (remainder != 0)
            return null;

        var tyreTempsUInt16 = perCar switch
        {
            CarRecordBytesTyreTempUInt8 => false,
            CarRecordBytesTyreTempUInt16 => true,
            _ => false,
        };

        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetryPacket
        {
            CarTelemetryData = new CarTelemetryData[cars]
        };

        for (var i = 0; i < cars; i++)
            packet.CarTelemetryData[i] = ReadOneCar(reader, tyreTempsUInt16);

        packet.MfdPanelIndex = reader.ReadByte();
        packet.MfdPanelIndexSecondaryPlayer = reader.ReadByte();
        packet.SuggestedGear = reader.ReadSByte();

        return packet;
    }
}
