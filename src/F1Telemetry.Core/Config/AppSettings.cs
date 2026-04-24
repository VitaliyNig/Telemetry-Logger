namespace F1Telemetry.Config;

public sealed class AppSettings
{
    public const string SectionName = "App";

    public int WebPort { get; set; } = 5000;
    public bool DebugMode { get; set; }
    public bool EnableSessionLogging { get; set; } = true;

    /// <summary>When true, opens the web UI in the default browser after the host starts (desktop only).</summary>
    public bool LaunchBrowserOnStart { get; set; } = true;

    /// <summary>
    /// Optional override for the History view's source folder. Absolute path, or relative
    /// to the app base directory. When null/empty, defaults to "Logs" under the base dir.
    /// Only affects reading; new sessions are still written to the default Logs folder.
    /// </summary>
    public string? HistoryFolder { get; set; }
}
