using System.Net;
using System.Net.Sockets;
using F1Telemetry.Ingress;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace F1Telemetry.Udp;

/// <summary>Listens for UDP telemetry and forwards each datagram to <see cref="ITelemetryIngress"/>.</summary>
public sealed class TelemetryUdpReceiveService : BackgroundService
{
    private readonly ITelemetryIngress _ingress;
    private readonly IOptionsMonitor<TelemetryUdpOptions> _options;
    private readonly ILogger<TelemetryUdpReceiveService> _logger;

    public TelemetryUdpReceiveService(
        ITelemetryIngress ingress,
        IOptionsMonitor<TelemetryUdpOptions> options,
        ILogger<TelemetryUdpReceiveService> logger)
    {
        _ingress = ingress;
        _options = options;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var opt = _options.CurrentValue;
        if (!IPAddress.TryParse(opt.ListenAddress, out var address))
        {
            _logger.LogError("Invalid TelemetryUdp:ListenAddress {Address}", opt.ListenAddress);
            return;
        }

        using var client = new UdpClient(new IPEndPoint(address, opt.Port));
        // Default Windows SO_RCVBUF is 8 KB — exactly one F1 25 frame (14 packets × ~600 B).
        // Any momentary stall in OnPacketAsync (JIT, GC, SignalR cold path) causes the kernel
        // to silently drop new datagrams. Raise to 1 MB so we tolerate ~2 s of backpressure
        // before losing anything. Cheap (only allocated on socket, not per-packet) and the
        // value is best-effort — Windows clamps to the system maximum if higher.
        try
        {
            client.Client.ReceiveBufferSize = 1024 * 1024;
            _logger.LogInformation(
                "UDP telemetry listening on {Endpoint} (SO_RCVBUF = {Buf} bytes)",
                client.Client.LocalEndPoint, client.Client.ReceiveBufferSize);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to raise SO_RCVBUF; falling back to OS default.");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            UdpReceiveResult received;
            try
            {
                received = await client.ReceiveAsync(stoppingToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "UDP receive failed");
                await Task.Delay(500, stoppingToken).ConfigureAwait(false);
                continue;
            }

            var packet = new RawTelemetryPacket(DateTimeOffset.UtcNow, received.RemoteEndPoint, received.Buffer);

            try
            {
                await _ingress.OnPacketAsync(packet, stoppingToken).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Ingress failed for packet from {Remote}", received.RemoteEndPoint);
            }
        }
    }
}
