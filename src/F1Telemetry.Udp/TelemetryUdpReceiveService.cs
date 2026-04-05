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
        _logger.LogInformation("UDP telemetry listening on {Endpoint}", client.Client.LocalEndPoint);

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

            var payload = received.Buffer.AsMemory().ToArray();
            var packet = new RawTelemetryPacket(DateTimeOffset.UtcNow, received.RemoteEndPoint, payload);

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
