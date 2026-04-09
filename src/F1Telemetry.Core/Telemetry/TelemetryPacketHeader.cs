using System.Text.Json.Serialization;

namespace F1Telemetry.Telemetry;

/// <summary>
/// Neutral header shape shared across game versions; each version module maps raw bytes to this.
/// </summary>
public readonly record struct TelemetryPacketHeader(
    ushort PacketFormat,
    byte GameYear,
    byte GameMajorVersion,
    byte GameMinorVersion,
    byte PacketVersion,
    byte PacketId,
    [property: JsonConverter(typeof(ULongJsonStringConverter))]
    ulong SessionUid,
    float SessionTime,
    uint FrameIdentifier,
    uint OverallFrameIdentifier,
    byte PlayerCarIndex,
    byte SecondaryPlayerCarIndex);
