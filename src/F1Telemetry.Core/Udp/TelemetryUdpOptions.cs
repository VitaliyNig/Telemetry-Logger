namespace F1Telemetry.Udp;

public sealed class TelemetryUdpOptions
{
    public const string SectionName = "TelemetryUdp";

    /// <summary>UDP listen address. Use 0.0.0.0 to accept from any interface.</summary>
    public string ListenAddress { get; set; } = "0.0.0.0";

    /// <summary>Port must match the game's UDP telemetry port.</summary>
    public int Port { get; set; } = 20777;
}
