using System.Buffers.Binary;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol;

/// <summary>
/// Parses the 29-byte F1 UDP packet header (little-endian). Header layout is identical
/// across all known formats (2024, 2025, 2026), so a single reader serves every plugin.
/// The plugin is then chosen by <c>m_packetFormat</c> via <see cref="ProtocolRegistry"/>.
///
/// If a future game changes the header layout we either bump <see cref="HeaderSize"/>
/// here (if it's only an additive change) or split into per-format header readers and
/// surface them via <see cref="IProtocolPlugin"/>.
/// </summary>
public sealed class PacketHeaderReader : IPacketHeaderReader
{
    public const int HeaderSize = 29;

    public int HeaderByteLength => HeaderSize;

    public bool TryRead(ReadOnlySpan<byte> source, out TelemetryPacketHeader header)
    {
        header = default;
        if (source.Length < HeaderSize)
            return false;

        var packetFormat = BinaryPrimitives.ReadUInt16LittleEndian(source);
        var gameYear = source[2];
        var gameMajor = source[3];
        var gameMinor = source[4];
        var packetVersion = source[5];
        var packetId = source[6];
        var sessionUid = BinaryPrimitives.ReadUInt64LittleEndian(source[7..]);
        var sessionTime = BinaryPrimitives.ReadSingleLittleEndian(source[15..]);
        var frameId = BinaryPrimitives.ReadUInt32LittleEndian(source[19..]);
        var overallFrameId = BinaryPrimitives.ReadUInt32LittleEndian(source[23..]);
        var playerCar = source[27];
        var secondaryPlayerCar = source[28];

        header = new TelemetryPacketHeader(
            packetFormat,
            gameYear,
            gameMajor,
            gameMinor,
            packetVersion,
            packetId,
            sessionUid,
            sessionTime,
            frameId,
            overallFrameId,
            playerCar,
            secondaryPlayerCar);

        return true;
    }
}
