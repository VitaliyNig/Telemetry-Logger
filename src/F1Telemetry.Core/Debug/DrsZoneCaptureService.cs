namespace F1Telemetry.Debug;

public enum DrsCaptureState
{
    Idle = 0,
    Armed = 1,
    Recording = 2,
    Completed = 3,
}

public sealed record DrsCaptureSnapshot(
    DrsCaptureState State,
    int? TrackId,
    byte? CurrentLapNum,
    float CurrentLapFraction,
    int CapturedZoneCount,
    IReadOnlyList<DrsZoneRange> Zones,
    string? Error);

public readonly record struct DrsZoneRange(float Start, float End);

/// <summary>
/// State machine for capturing DRS zones from a live Time Trial lap.
/// Driven by <see cref="OnPlayerLapData"/> from the telemetry ingress; controlled by Arm/Cancel
/// from the debug API. Zones are detected as DrsAllowed 0->1 / 1->0 transitions across one
/// fully valid lap; an invalid lap (cut/penalty) auto-resets the buffer for the next lap.
/// </summary>
public sealed class DrsZoneCaptureService
{
    private const byte TimeTrialSessionType = 18;
    private const float MinZoneWidth = 1e-3f;

    private readonly object _sync = new();

    private DrsCaptureState _state = DrsCaptureState.Idle;
    private int? _trackId;
    private float _trackLengthM;
    private byte? _currentLapNum;
    private byte _lastDrsAllowed;
    private bool _lapInvalidSeen;
    private float? _pendingZoneStart;
    private float _currentLapFraction;
    private List<DrsZoneRange> _buffer = new();
    private List<DrsZoneRange> _captured = new();
    private string? _error;

    public DrsCaptureSnapshot Snapshot()
    {
        lock (_sync)
        {
            var zones = _state == DrsCaptureState.Completed
                ? (IReadOnlyList<DrsZoneRange>)_captured.ToArray()
                : Array.Empty<DrsZoneRange>();
            var liveCount = _state == DrsCaptureState.Recording
                ? _buffer.Count
                : zones.Count;
            return new DrsCaptureSnapshot(
                _state, _trackId, _currentLapNum, _currentLapFraction,
                liveCount, zones, _error);
        }
    }

    /// <summary>Move from Idle to Armed for the given track. No-op (returns current snapshot) if not Idle.</summary>
    public DrsCaptureSnapshot Arm(int trackId, float trackLengthM)
    {
        lock (_sync)
        {
            if (_state != DrsCaptureState.Idle)
                return SnapshotLocked();

            _state = DrsCaptureState.Armed;
            _trackId = trackId;
            _trackLengthM = trackLengthM;
            _currentLapNum = null;
            _lastDrsAllowed = 0;
            _lapInvalidSeen = false;
            _pendingZoneStart = null;
            _currentLapFraction = 0f;
            _buffer = new List<DrsZoneRange>();
            _captured = new List<DrsZoneRange>();
            _error = null;
            return SnapshotLocked();
        }
    }

    public void Cancel()
    {
        lock (_sync)
        {
            ResetLocked(error: null);
        }
    }

    /// <summary>
    /// When state is Completed, returns a copy of the captured zones for inspection or saving.
    /// State is unchanged — the caller decides whether to commit (via <see cref="CommitSave"/>)
    /// or retry. Returns false when there is nothing captured.
    /// </summary>
    public bool TryPeek(out int trackId, out DrsZoneRange[] zones)
    {
        lock (_sync)
        {
            if (_state != DrsCaptureState.Completed || _trackId is null)
            {
                trackId = 0;
                zones = Array.Empty<DrsZoneRange>();
                return false;
            }

            trackId = _trackId.Value;
            zones = _captured.ToArray();
            return true;
        }
    }

    /// <summary>Resets to Idle once a save has succeeded.</summary>
    public void CommitSave()
    {
        lock (_sync)
        {
            if (_state == DrsCaptureState.Completed)
                ResetLocked(error: null);
        }
    }

    /// <summary>
    /// Called from the telemetry ingress on every LapData packet for the player's car.
    /// No-op when state is Idle.
    /// </summary>
    public void OnPlayerLapData(
        byte sessionType,
        int trackId,
        float trackLengthM,
        byte currentLapNum,
        byte currentLapInvalid,
        float lapDistance,
        byte drsAllowed)
    {
        lock (_sync)
        {
            if (_state == DrsCaptureState.Idle || _state == DrsCaptureState.Completed)
                return;

            if (sessionType != TimeTrialSessionType)
            {
                ResetLocked(error: "Capture aborted: not a Time Trial session.");
                return;
            }

            // Stick with the trackId chosen at Arm time — switching tracks mid-capture would
            // be a UI-level mistake; we don't try to follow it.
            if (_trackId is int armedTrackId && trackId != armedTrackId)
            {
                ResetLocked(error: "Capture aborted: track changed during capture.");
                return;
            }

            // Fraction of the current lap. trackLengthM may briefly be 0 between sessions —
            // skip those packets rather than divide by zero.
            if (trackLengthM > 0f)
            {
                _trackLengthM = trackLengthM;
                _currentLapFraction = Math.Clamp(lapDistance / trackLengthM, 0f, 1f);
            }
            else if (_trackLengthM > 0f)
            {
                _currentLapFraction = Math.Clamp(lapDistance / _trackLengthM, 0f, 1f);
            }
            else
            {
                return;
            }

            // First sample after Arm: latch the initial lap number, stay Armed until rollover.
            if (_currentLapNum is null)
            {
                _currentLapNum = currentLapNum;
                _lastDrsAllowed = drsAllowed;
                return;
            }

            // Lap rollover (CurrentLapNum increments). Either start Recording or finalize.
            if (currentLapNum != _currentLapNum.Value)
            {
                if (_state == DrsCaptureState.Armed)
                {
                    _state = DrsCaptureState.Recording;
                    _currentLapNum = currentLapNum;
                    _lapInvalidSeen = false;
                    _pendingZoneStart = null;
                    _buffer.Clear();
                    _lastDrsAllowed = drsAllowed;
                    return;
                }

                // Recording -> close any zone open across the start-finish line at fraction 1.0,
                // then decide based on whether the just-finished lap was clean.
                if (_pendingZoneStart is float startFrac)
                {
                    AppendZoneIfValid(startFrac, 1f);
                    _pendingZoneStart = null;
                }

                if (!_lapInvalidSeen && _buffer.Count > 0)
                {
                    _captured = _buffer;
                    _state = DrsCaptureState.Completed;
                    _error = null;
                    return;
                }

                // Invalid lap or no zones detected (e.g. player drove the wrong way / quit out):
                // reset and try the next lap.
                _buffer = new List<DrsZoneRange>();
                _lapInvalidSeen = false;
                _currentLapNum = currentLapNum;
                _lastDrsAllowed = drsAllowed;
                return;
            }

            // Within the same lap.
            if (currentLapInvalid != 0)
                _lapInvalidSeen = true;

            if (_state != DrsCaptureState.Recording)
            {
                _lastDrsAllowed = drsAllowed;
                return;
            }

            if (_lastDrsAllowed == 0 && drsAllowed == 1)
            {
                _pendingZoneStart = _currentLapFraction;
            }
            else if (_lastDrsAllowed == 1 && drsAllowed == 0 && _pendingZoneStart is float startFrac)
            {
                AppendZoneIfValid(startFrac, _currentLapFraction);
                _pendingZoneStart = null;
            }

            _lastDrsAllowed = drsAllowed;
        }
    }

    private void AppendZoneIfValid(float start, float end)
    {
        var s = Math.Clamp(start, 0f, 1f);
        var e = Math.Clamp(end, 0f, 1f);
        if (e - s < MinZoneWidth) return;
        _buffer.Add(new DrsZoneRange(s, e));
    }

    private void ResetLocked(string? error)
    {
        _state = DrsCaptureState.Idle;
        _trackId = null;
        _trackLengthM = 0f;
        _currentLapNum = null;
        _lastDrsAllowed = 0;
        _lapInvalidSeen = false;
        _pendingZoneStart = null;
        _currentLapFraction = 0f;
        _buffer = new List<DrsZoneRange>();
        _captured = new List<DrsZoneRange>();
        _error = error;
    }

    private DrsCaptureSnapshot SnapshotLocked()
    {
        var zones = _state == DrsCaptureState.Completed
            ? (IReadOnlyList<DrsZoneRange>)_captured.ToArray()
            : Array.Empty<DrsZoneRange>();
        var liveCount = _state == DrsCaptureState.Recording ? _buffer.Count : zones.Count;
        return new DrsCaptureSnapshot(
            _state, _trackId, _currentLapNum, _currentLapFraction,
            liveCount, zones, _error);
    }
}
