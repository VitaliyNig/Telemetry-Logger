using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2025.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2025.Deserializers;

public sealed class CarTelemetry25PacketDeserializer : IPacketDeserializer
{
    public byte PacketId => (byte)F1PacketId.CarTelemetry25;

    /// <summary>Per-car payload size from F1 25 UDP spec (docs/F1 25 Telemetry Output Structures.txt).</summary>
    private const int CarRecordBytes = 60;

    private const int TrailerBytes = 3; // mfdPanelIndex, mfdPanelIndexSecondaryPlayer, suggestedGear

    /// <summary>29-byte header + 22 cars × 60 bytes + 3-byte trailer = 1352.</summary>
    private const int ExpectedPacketLength =
        PacketHeaderReader.HeaderSize + F125Constants.MaxCarsInUdpData * CarRecordBytes + TrailerBytes;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        if (data.Length < ExpectedPacketLength)
            return null;

        var reader = new BinaryReader125(data, PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetry25Packet
        {
            CarTelemetry25Data = new CarTelemetry25Data[F125Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < F125Constants.MaxCarsInUdpData; i++)
            packet.CarTelemetry25Data[i] = ReadOneCar(ref reader);

        packet.MfdPanelIndex = reader.ReadByte();
        packet.MfdPanelIndexSecondaryPlayer = reader.ReadByte();
        packet.SuggestedGear = reader.ReadSByte();

        return packet;
    }

    // Widened to ushort[] so JSON carries a numeric array (byte[] serializes as Base64).
    private static ushort[] ReadTyreTemperaturesAsUInt8(ref BinaryReader125 reader) =>
        [reader.ReadByte(), reader.ReadByte(), reader.ReadByte(), reader.ReadByte()];

    private static CarTelemetry25Data ReadOneCar(ref BinaryReader125 reader)
    {
        return new CarTelemetry25Data
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
            TyresSurfaceTemperature = ReadTyreTemperaturesAsUInt8(ref reader),
            TyresInnerTemperature = ReadTyreTemperaturesAsUInt8(ref reader),
            EngineTemperature = reader.ReadUInt16(),
            TyresPressure = reader.ReadFloatArray(4),
            SurfaceType = reader.ReadByteValuesAsIntArray(4),
        };
    }
}
