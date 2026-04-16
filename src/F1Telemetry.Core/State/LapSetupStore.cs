using System.Collections.Concurrent;

namespace F1Telemetry.State;

/// <summary>
/// Thread-safe in-memory store for per-lap car setup snapshots.
/// Detects lap transitions and captures the current setup at the moment a lap completes.
/// Clears automatically on session change.
/// </summary>
public sealed class LapSetupStore
{
    private readonly ConcurrentDictionary<byte, ConcurrentDictionary<int, object>> _snapshots = new();
    private readonly ConcurrentDictionary<byte, byte> _lastLapNum = new();
    private ulong _sessionUid;

    /// <summary>
    /// Call on every LapData packet. Detects lap transitions and captures setup snapshots.
    /// Returns the (lapIndex, setup) if a new snapshot was captured, otherwise null.
    /// </summary>
    public (int LapIndex, object Setup)? OnLapData(
        ulong sessionUid,
        byte carIndex,
        byte currentLapNum,
        Func<byte, object?> getSetup)
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

        // lapHistoryDataItems is 0-based and currentLapNum just incremented to the new lap
        var completedLapIdx = currentLapNum - 2;
        if (completedLapIdx < 0)
            return null;

        var setup = getSetup(carIndex);
        if (setup == null)
            return null;

        var carSnapshots = _snapshots.GetOrAdd(carIndex, _ => new ConcurrentDictionary<int, object>());
        carSnapshots[completedLapIdx] = setup;

        return (completedLapIdx, setup);
    }

    /// <summary>Returns all setup snapshots for a given car, or null if none exist.</summary>
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
