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

    /// <summary>How often the drain loop wakes up while the queue is quiet to look for idle sessions.</summary>
    private static readonly TimeSpan IdleCheckPeriod = TimeSpan.FromSeconds(60);

    /// <summary>A session with no packets for this long gets an idle checkpoint written
    /// (game closed / crashed without SEND). The session keeps recording if packets resume.</summary>
    private static readonly TimeSpan IdleCheckpointAfter = TimeSpan.FromMinutes(2);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var reader = _sessionLogger.Reader;

        try
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                // Wait for data with a timeout: when the game stops sending (finish line in
                // single player, Alt+F4, pause) nothing would otherwise wake this loop, and
                // idle sessions would never be checkpointed.
                using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                timeoutCts.CancelAfter(IdleCheckPeriod);
                bool hasData;
                try
                {
                    hasData = await reader.WaitToReadAsync(timeoutCts.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (!stoppingToken.IsCancellationRequested)
                {
                    _sessionLogger.CheckpointIdleSessions(IdleCheckpointAfter);
                    continue;
                }
                if (!hasData)
                    break; // channel completed

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
