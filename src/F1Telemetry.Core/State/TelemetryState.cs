using System.Collections.Concurrent;

namespace F1Telemetry.State;

/// <summary>
/// Thread-safe in-memory store for the latest telemetry snapshot.
/// Each packet type overwrites the previous value.
/// </summary>
public sealed class TelemetryState
{
    private readonly ConcurrentDictionary<byte, object> _latestPackets = new();

    public void Update(byte packetId, object packet) =>
        _latestPackets[packetId] = packet;

    public T? Get<T>(byte packetId) where T : class =>
        _latestPackets.TryGetValue(packetId, out var obj) ? obj as T : null;

    public object? Get(byte packetId) =>
        _latestPackets.GetValueOrDefault(packetId);

    public IReadOnlyDictionary<byte, object> GetAll() => _latestPackets;

    public void Clear() => _latestPackets.Clear();
}
