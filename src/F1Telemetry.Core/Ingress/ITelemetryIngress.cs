namespace F1Telemetry.Ingress;

/// <summary>Entry point for raw telemetry; live pipeline, recording, and replay will plug in here.</summary>
public interface ITelemetryIngress
{
    Task OnPacketAsync(RawTelemetryPacket packet, CancellationToken cancellationToken);
}
