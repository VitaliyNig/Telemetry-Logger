namespace F1Telemetry.Telemetry;

/// <summary>
/// Deserializes raw packet bytes into a strongly-typed packet object.
/// Each game version provides its own set of deserializers.
/// </summary>
public interface IPacketDeserializer
{
    byte PacketId { get; }

    object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header);
}
