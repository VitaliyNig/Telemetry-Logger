namespace F1Telemetry.Telemetry;

/// <summary>
/// Reads the fixed-size UDP packet header for a specific game/protocol version.
/// </summary>
public interface IPacketHeaderReader
{
    int HeaderByteLength { get; }

    bool TryRead(ReadOnlySpan<byte> source, out TelemetryPacketHeader header);
}
