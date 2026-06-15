using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// "Original" car telemetry packet (id 6, named CarTelemetry25 after the F1 25 introduction)
/// for format 2026. Compared to 2025:
/// - 24 cars instead of 22.
/// - <c>m_engineTemperature</c> is uint8 (was uint16) — still stored as ushort in the DTO,
///   so the union model is preserved.
/// </summary>
internal sealed class CarTelemetry25PacketDeserializer : IPacketDeserializer
{
    /// <summary>Per-car payload size for format 2026: was 60 in 2025, becomes 59 (engine temp shrunk by 1 byte).</summary>
    private const int CarRecordBytes = 59;

    private const int TrailerBytes = 3; // mfdPanelIndex, mfdPanelIndexSecondaryPlayer, suggestedGear

    /// <summary>29-byte header + 24 cars × 59 bytes + 3-byte trailer = 1448.</summary>
    private const int ExpectedPacketLength =
        PacketHeaderReader.HeaderSize + Format2026Constants.MaxCarsInUdpData * CarRecordBytes + TrailerBytes;

    public byte PacketId => (byte)F1PacketId.CarTelemetry25;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        if (data.Length < ExpectedPacketLength)
            return null;

        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new CarTelemetry25Packet
        {
            CarTelemetry25Data = new CarTelemetry25Data[Format2026Constants.MaxCarsInUdpData]
        };

        for (var i = 0; i < Format2026Constants.MaxCarsInUdpData; i++)
            packet.CarTelemetry25Data[i] = ReadOneCar(ref reader);

        packet.MfdPanelIndex = reader.ReadByte();
        packet.MfdPanelIndexSecondaryPlayer = reader.ReadByte();
        packet.SuggestedGear = reader.ReadSByte();

        return packet;
    }

    private static ushort[] ReadTyreTemperaturesAsUInt8(ref BinaryReader126 reader) =>
        [reader.ReadByte(), reader.ReadByte(), reader.ReadByte(), reader.ReadByte()];

    private static CarTelemetry25Data ReadOneCar(ref BinaryReader126 reader)
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
            // 2026: uint8 (was uint16 in 2025). Widen to ushort so the DTO matches both formats.
            EngineTemperature = reader.ReadByte(),
            TyresPressure = reader.ReadFloatArray(4),
            SurfaceType = reader.ReadByteValuesAsIntArray(4),
        };
    }
}
