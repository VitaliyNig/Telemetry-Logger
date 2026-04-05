using System.Collections.Concurrent;

namespace F1Telemetry.Debug;

public sealed class DebugPacketTracker
{
    private readonly ConcurrentDictionary<string, long> _packetCounts = new();
    private readonly ConcurrentQueue<DebugLogEntry> _logEntries = new();
    private long _totalPackets;

    public const int MaxLogEntries = 5000;

    public void RecordPacket(string packetName)
    {
        _packetCounts.AddOrUpdate(packetName, 1, (_, count) => count + 1);
        Interlocked.Increment(ref _totalPackets);

        var entry = new DebugLogEntry(DateTimeOffset.UtcNow, packetName);
        _logEntries.Enqueue(entry);

        while (_logEntries.Count > MaxLogEntries)
            _logEntries.TryDequeue(out _);
    }

    public long TotalPackets => Interlocked.Read(ref _totalPackets);

    public Dictionary<string, long> GetPacketCounts() => new(_packetCounts);

    public IReadOnlyList<DebugLogEntry> GetRecentEntries() => _logEntries.ToArray();

    public string ExportLog()
    {
        var entries = _logEntries.ToArray();
        var lines = entries.Select(e =>
            $"{e.Timestamp:yyyy-MM-dd HH:mm:ss.fff} | {e.PacketName}");
        return string.Join(Environment.NewLine, lines);
    }

    public void Reset()
    {
        _packetCounts.Clear();
        _logEntries.Clear();
        Interlocked.Exchange(ref _totalPackets, 0);
    }
}

public readonly record struct DebugLogEntry(DateTimeOffset Timestamp, string PacketName);
