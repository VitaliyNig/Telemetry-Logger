namespace F1Telemetry.Config;

public sealed class AppSettings
{
    public const string SectionName = "App";

    public int WebPort { get; set; } = 5000;
    public bool DebugMode { get; set; }

    /// <summary>When true, opens the web UI in the default browser after the host starts (desktop only).</summary>
    public bool LaunchBrowserOnStart { get; set; } = true;
}
