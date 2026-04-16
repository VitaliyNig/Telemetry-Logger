using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using F1Telemetry.Config;
using Hardcodet.Wpf.TaskbarNotification;
using Microsoft.Extensions.Hosting;

namespace F1Telemetry.Tray;

sealed class TelemetryTrayApp : Application
{
    private readonly string[] _args;
    private TaskbarIcon? _trayIcon;
    private CancellationTokenSource? _cts;

    internal TelemetryTrayApp(string[] args)
    {
        _args = args;
        ShutdownMode = ShutdownMode.OnExplicitShutdown;
    }

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        WebApplication? webApp = null;
        try
        {
            webApp = Program.BuildWebApp(_args);

            var config = webApp.Configuration;
            var appSettings = config.GetSection(AppSettings.SectionName).Get<AppSettings>() ?? new AppSettings();
            var webPort = appSettings.WebPort;
            var udpAddress = config.GetValue<string>("TelemetryUdp:ListenAddress") ?? "0.0.0.0";
            var udpPort = config.GetValue<int?>("TelemetryUdp:Port") ?? 20777;
            var dataFolder = Path.Combine(AppContext.BaseDirectory, "Logs");

            _trayIcon = new TaskbarIcon
            {
                Icon = CreateAppIcon(),
                ToolTipText = "Telemetry Logger",
                TrayPopup = new TrayPopup(webPort, udpAddress, udpPort, dataFolder),
                PopupActivation = PopupActivationMode.LeftOrRightClick
            };

            var lifetime = webApp.Services.GetRequiredService<IHostApplicationLifetime>();
            var port = webPort;
            var tray = _trayIcon;

            lifetime.ApplicationStarted.Register(() =>
            {
                Dispatcher.BeginInvoke(() =>
                {
                    tray?.ShowBalloonTip(
                        "Telemetry Logger",
                        "The app is running in the background. Click the tray icon to open the web interface or manage the application.",
                        BalloonIcon.Info);
                });

                if (appSettings.LaunchBrowserOnStart)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = $"http://localhost:{port}",
                            UseShellExecute = true
                        });
                    }
                    catch { /* browser launch is best-effort */ }
                }
            });

            _cts = new CancellationTokenSource();
            await webApp.RunAsync(_cts.Token);
        }
        catch (OperationCanceledException) { /* normal shutdown */ }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to start Telemetry Logger:\n\n{ex.Message}",
                "Telemetry Logger",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            Shutdown(1);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _trayIcon?.Dispose();
        _cts?.Cancel();
        base.OnExit(e);
        // The web host shutdown runs on background threads; terminate the process
        // immediately so the user doesn't wait for Kestrel/UDP teardown.
        Environment.Exit(0);
    }

    private static System.Drawing.Icon CreateAppIcon()
    {
        const int size = 256;
        const string logoPath =
            "M74 217.193L38.3682 162.364L62.7363 107.536H2.73633L27.1045 52.707H162.104" +
            "L168.197 39H228.197L222.104 52.707L197.736 107.536H122.736L74 217.193Z" +
            "M173.368 162.364H218.368L254 217.193H89L131.645 121.243H191.645L173.368 162.364Z";

        var visual = new DrawingVisual();
        using (var dc = visual.RenderOpen())
        {
            dc.DrawGeometry(
                new SolidColorBrush(Color.FromRgb(0x9B, 0x3F, 0xF5)),
                null, Geometry.Parse(logoPath));
        }

        var rtb = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
        rtb.Render(visual);

        using var pngStream = new MemoryStream();
        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(rtb));
        encoder.Save(pngStream);
        var pngBytes = pngStream.ToArray();

        return BuildIcoFromPng(pngBytes);
    }

    private static System.Drawing.Icon BuildIcoFromPng(byte[] pngBytes)
    {
        using var ico = new MemoryStream();
        using (var bw = new BinaryWriter(ico, System.Text.Encoding.UTF8, leaveOpen: true))
        {
            // ICO header
            bw.Write((short)0);           // reserved
            bw.Write((short)1);           // type = icon
            bw.Write((short)1);           // image count

            // Directory entry (PNG-in-ICO, supported by Vista+)
            bw.Write((byte)0);            // width  (0 = 256)
            bw.Write((byte)0);            // height (0 = 256)
            bw.Write((byte)0);            // color count
            bw.Write((byte)0);            // reserved
            bw.Write((short)1);           // color planes
            bw.Write((short)32);          // bits per pixel
            bw.Write(pngBytes.Length);    // image data size
            bw.Write(22);                 // data offset (6 header + 16 entry)

            bw.Write(pngBytes);
        }

        ico.Position = 0;
        return new System.Drawing.Icon(ico);
    }
}
