using System.Collections.Concurrent;
using System.Text;

namespace F1Telemetry.Debug;

public sealed class DebugPacketTracker
{
    private readonly ConcurrentDictionary<byte, long> _packetCounts = new();
    private readonly ConcurrentQueue<DebugLogEntry> _logEntries = new();
    private long _totalPackets;

    public const int MaxLogEntries = 5000;

    /// <summary>Resolves a packet byte id to a display name. Set once at startup.</summary>
    public Func<byte, string> PacketNameResolver { get; set; } = static id => id.ToString();

    public void RecordPacket(byte packetId)
    {
        _packetCounts.AddOrUpdate(packetId, 1, (_, count) => count + 1);
        Interlocked.Increment(ref _totalPackets);

        var entry = new DebugLogEntry(DateTimeOffset.UtcNow, packetId);
        _logEntries.Enqueue(entry);

        while (_logEntries.Count > MaxLogEntries)
            _logEntries.TryDequeue(out _);
    }

    public long TotalPackets => Interlocked.Read(ref _totalPackets);

    public IReadOnlyDictionary<byte, long> GetPacketCounts() => _packetCounts;

    /// <summary>Returns packet counts keyed by display name (for API/debug serialization).</summary>
    public Dictionary<string, long> GetPacketCountsByName()
    {
        var result = new Dictionary<string, long>();
        foreach (var (id, count) in _packetCounts)
            result[PacketNameResolver(id)] = count;
        return result;
    }

    public IReadOnlyList<DebugLogEntry> GetRecentEntries() => _logEntries.ToArray();

    public string ExportLog()
    {
        var entries = _logEntries.ToArray();
        var sb = new StringBuilder();
        foreach (var e in entries)
        {
            sb.Append(e.Timestamp.ToString("yyyy-MM-dd HH:mm:ss.fff"));
            sb.Append(" | ");
            sb.AppendLine(PacketNameResolver(e.PacketId));
        }
        return sb.ToString();
    }

    public void Reset()
    {
        _packetCounts.Clear();
        _logEntries.Clear();
        Interlocked.Exchange(ref _totalPackets, 0);
    }
}

public readonly record struct DebugLogEntry(DateTimeOffset Timestamp, byte PacketId);
