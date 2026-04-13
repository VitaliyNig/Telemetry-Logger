using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;

namespace F1Telemetry.Tray;

public partial class TrayPopup : UserControl
{
    private readonly int _webPort;
    private readonly string _dataFolder;

    public TrayPopup(int webPort, string udpAddress, int udpPort, string dataFolder)
    {
        _webPort = webPort;
        _dataFolder = dataFolder;

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
        var target = Directory.Exists(_dataFolder) ? _dataFolder : AppContext.BaseDirectory;
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
