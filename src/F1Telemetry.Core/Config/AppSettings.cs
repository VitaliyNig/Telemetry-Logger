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
    /// Persisted root folder for session history (read AND write). Absolute path or
    /// relative to the app base directory. When null/empty, defaults to "Logs/".
    /// The History tab can also temporarily override the read root for the running
    /// process — that override is not persisted.
    /// </summary>
    public string? HistoryFolder { get; set; }

    /// <summary>
    /// UDP packet format the game is expected to emit. Written to
    /// <c>hardware_settings_config.xml</c> via <c>/api/game/configure-udp</c> and exposed
    /// through <c>/api/info</c>. When null/empty, the host picks the newest registered
    /// format plugin (highest <c>m_packetFormat</c>). Valid tokens are the
    /// <c>IProtocolPlugin.ConfigFormatToken</c> values — currently "2025" or "2026".
    /// </summary>
    public string? UdpFormat { get; set; }
}
