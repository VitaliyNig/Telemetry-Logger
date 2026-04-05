namespace F1Telemetry.Config;

public sealed class AppSettings
{
    public const string SectionName = "App";

    public int WebPort { get; set; } = 5000;
    public bool DebugMode { get; set; }
}
