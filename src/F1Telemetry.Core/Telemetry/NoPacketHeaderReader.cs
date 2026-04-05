namespace F1Telemetry.Telemetry;

/// <summary>
/// Fallback when no game module is registered; never parses successfully.
/// </summary>
public sealed class NoPacketHeaderReader : IPacketHeaderReader
{
    public int HeaderByteLength => 0;

    public bool TryRead(ReadOnlySpan<byte> source, out TelemetryPacketHeader header)
    {
        header = default;
        return false;
    }
}
