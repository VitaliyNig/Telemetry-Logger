using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Background drain for <see cref="SessionLogger"/>'s internal channel. Runs on a dedicated
/// task so telemetry ingestion (UDP read + SignalR broadcast) never waits on JSON serialization
/// or lap-completion bookkeeping. On shutdown, consumes whatever is left and then lets
/// <see cref="SessionLogger.Flush"/> write final session files.
/// </summary>
public sealed class SessionLoggerWriter : BackgroundService
{
    private readonly SessionLogger _sessionLogger;
    private readonly ILogger<SessionLoggerWriter> _logger;

    public SessionLoggerWriter(SessionLogger sessionLogger, ILogger<SessionLoggerWriter> logger)
    {
        _sessionLogger = sessionLogger;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reader = _sessionLogger.Reader;

        try
        {
            while (await reader.WaitToReadAsync(stoppingToken).ConfigureAwait(false))
            {
                while (reader.TryRead(out var envelope))
                {
                    try
                    {
                        _sessionLogger.ProcessPacket(envelope.Header, envelope.PacketId, envelope.Data);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "SessionLogger.ProcessPacket threw");
                    }
                }
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown path.
        }

        // Drain any remaining envelopes after cancellation so we don't lose the tail of a session.
        while (reader.TryRead(out var envelope))
        {
            try
            {
                _sessionLogger.ProcessPacket(envelope.Header, envelope.PacketId, envelope.Data);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SessionLogger.ProcessPacket threw during drain");
            }
        }
    }
}
