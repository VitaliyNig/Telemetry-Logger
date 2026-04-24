using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using F1Telemetry.Host.Logging;

namespace F1Telemetry.Tray;

public partial class TrayPopup : UserControl
{
    private readonly int _webPort;

    public TrayPopup(int webPort, string udpAddress, int udpPort)
    {
        _webPort = webPort;

        InitializeComponent();

        HttpUrl.Text = $"http://localhost:{webPort}";
        UdpInfo.Text = $"{udpAddress}:{udpPort}";
    }

    private void OpenWebInterface_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = $"http://localhost:{_webPort}",
                UseShellExecute = true
            });
        }
        catch { /* best-effort */ }
    }

    private void OpenDataFolder_Click(object sender, RoutedEventArgs e)
    {
        // Resolve the live persisted root each click so a Settings change is picked up
        // without recreating the tray popup.
        var dataFolder = HistoryRoot.PersistentDefault;
        var target = Directory.Exists(dataFolder) ? dataFolder : AppContext.BaseDirectory;
        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = "explorer.exe",
                Arguments = target
            });
        }
        catch { /* best-effort */ }
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Application.Current.Shutdown();
    }
}
