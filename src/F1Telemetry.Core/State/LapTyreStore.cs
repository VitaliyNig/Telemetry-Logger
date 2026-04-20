using System.Collections.Concurrent;

namespace F1Telemetry.State;

/// <summary>
/// Thread-safe in-memory store for per-lap tyre snapshots (compound, age, wear).
/// Detects lap transitions and captures tyre state at the moment a lap completes.
/// Clears automatically on session change.
/// </summary>
public sealed class LapTyreStore
{
    private readonly ConcurrentDictionary<byte, ConcurrentDictionary<int, object>> _snapshots = new();
    private readonly ConcurrentDictionary<byte, byte> _lastLapNum = new();
    private ulong _sessionUid;

    /// <summary>
    /// Call on every LapData packet. Detects lap transitions and captures tyre snapshots.
    /// Returns the (lapIndex, snapshot) if a new snapshot was captured, otherwise null.
    /// </summary>
    public (int LapIndex, object Snapshot)? OnLapData(
        ulong sessionUid,
        byte carIndex,
        byte currentLapNum,
        Func<byte, object?> getSnapshot)
    {
        if (sessionUid != _sessionUid)
        {
            Clear();
            _sessionUid = sessionUid;
        }

        if (!_lastLapNum.TryGetValue(carIndex, out var prev) || prev == currentLapNum)
        {
            _lastLapNum[carIndex] = currentLapNum;
            return null;
        }

        _lastLapNum[carIndex] = currentLapNum;

        var completedLapIdx = currentLapNum - 2;
        if (completedLapIdx < 0)
            return null;

        var snapshot = getSnapshot(carIndex);
        if (snapshot == null)
            return null;

        var carSnapshots = _snapshots.GetOrAdd(carIndex, _ => new ConcurrentDictionary<int, object>());
        carSnapshots[completedLapIdx] = snapshot;

        return (completedLapIdx, snapshot);
    }

    public IReadOnlyDictionary<int, object>? GetSnapshots(byte carIndex) =>
        _snapshots.TryGetValue(carIndex, out var carSnapshots) && carSnapshots.Count > 0
            ? carSnapshots
            : null;

    public void Clear()
    {
        _snapshots.Clear();
        _lastLapNum.Clear();
    }
}
