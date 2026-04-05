namespace F1Telemetry.Telemetry;

/// <summary>
/// Processes a deserialized telemetry packet (e.g. stores state, broadcasts to clients).
/// </summary>
public interface IPacketProcessor
{
    Task ProcessAsync(TelemetryPacketHeader header, object packet, CancellationToken ct);
}
