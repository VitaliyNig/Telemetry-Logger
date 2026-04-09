using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class CarTelemetryPacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F125PacketId.CarTelemetry;

    /// <summary>Per-car payload size from F1 25 UDP spec (docs/F1 25 Telemetry Output Structures.txt).</summary>
    private const int CarRecordBytes = 60;

    private const int TrailerBytes = 3; // mfdPanelIndex, mfdPanelIndexSecondaryPlayer, suggestedGear

    /// <summary>29-byte header + 22 cars × 60 bytes + 3-byte trailer = 1352.</summary>
    private const int ExpectedPacketLength =
        F125PacketHeaderReader.HeaderSize + F125Constants.MaxCarsInUdpData * CarRecordBytes + TrailerBytes;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        if (data.Length < ExpectedPacketLength)
            return null;

        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetryPacket
        {
            CarTelemetryData = new CarTelemetryData[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
            packet.CarTelemetryData[i] = ReadOneCar(reader);

        packet.MfdPanelIndex = reader.ReadByte();
        packet.MfdPanelIndexSecondaryPlayer = reader.ReadByte();
        packet.SuggestedGear = reader.ReadSByte();

        return packet;
    }

    private static ushort[] ReadTyreTemperaturesAsUInt8(BinaryReader125 reader)
    {
        var bytes = reader.ReadByteArray(4);
        return [bytes[0], bytes[1], bytes[2], bytes[3]];
    }

    private static CarTelemetryData ReadOneCar(BinaryReader125 reader)
    {
        return new CarTelemetryData
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
            TyresSurfaceTemperature = ReadTyreTemperaturesAsUInt8(reader),
            TyresInnerTemperature = ReadTyreTemperaturesAsUInt8(reader),
            EngineTemperature = reader.ReadUInt16(),
            TyresPressure = reader.ReadFloatArray(4),
            SurfaceType = reader.ReadByteArray(4),
        };
    }
}
