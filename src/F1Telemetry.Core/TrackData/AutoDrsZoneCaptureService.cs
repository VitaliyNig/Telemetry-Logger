namespace F1Telemetry.TrackData;

/// <summary>
/// Automatically captures DRS zones from valid player laps in practice, qualifying,
/// race (and time-trial) sessions. Activates only when no DRS zone data exists for
/// the current track in <c>drs-zones.json</c>. Saves silently once a valid lap
/// with detected zones is completed.
/// </summary>
public sealed class AutoDrsZoneCaptureService
{
    private readonly DrsZoneStore _store;

    private readonly object _sync = new();
    private readonly HashSet<int> _resolvedTracks = new();

    // ~0.5 % of the lap. Below this a "zone" is almost certainly a brief m_drs flicker
    // (e.g. activation-line crossing) rather than a real zone — drop it so the buffer is not
    // poisoned and capture can keep trying on subsequent laps.
    private const float MinZoneWidth = 0.005f;

    // Practice (1-4), Qualifying (5-9), Time Trial (18) only. In Race (10) and Sprint (11-12)
    // m_drsAllowed is gap-gated (≤1 s to the car ahead), so transitions to 1 do not mark zone
    // entry/exit reliably — they fire briefly whenever the gap closes and miss zones whenever
    // the player runs alone. Capturing in those modes was the root cause of the prior
    // fragmented Melbourne data.
    private static bool IsCaptureSession(byte sessionType) =>
        sessionType is >= 1 and <= 9 or 18;

    private int? _trackId;
    private float _trackLengthM;
    private byte? _currentLapNum;
    private byte _lastDrs;
    private bool _lapInvalidSeen;
    private float? _pendingZoneStart;
    private float _currentLapFraction;
    private List<DrsZoneRange> _buffer = new();
    private bool _hasPendingSave;

    public AutoDrsZoneCaptureService(DrsZoneStore store)
    {
        _store = store;
    }

    /// <summary>
    /// Called from the telemetry ingress on every LapData packet for the player's car.
    /// Returns <c>true</c> when a completed capture is ready to be saved.
    /// </summary>
    public bool OnPlayerLapData(
        byte sessionType,
        int trackId,
        float trackLengthM,
        byte currentLapNum,
        byte currentLapInvalid,
        float lapDistance,
        byte drs)
    {
        if (!IsCaptureSession(sessionType))
            return false;

        lock (_sync)
        {
            if (_resolvedTracks.Contains(trackId))
                return false;

            if (_hasPendingSave)
                return false;

            // If the track changed (or first packet), check whether zones already exist.
            if (_trackId != trackId)
            {
                if (_store.HasZones(trackId))
                {
                    _resolvedTracks.Add(trackId);
                    ResetLocked();
                    return false;
                }

                // Arm for this track.
                _trackId = trackId;
                _trackLengthM = trackLengthM;
                _currentLapNum = null;
                _lastDrs = 0;
                _lapInvalidSeen = false;
                _pendingZoneStart = null;
                _currentLapFraction = 0f;
                _buffer = new List<DrsZoneRange>();
            }

            // Compute lap fraction.
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
                return false;
            }

            // First packet after arming — latch lap number and wait for rollover.
            if (_currentLapNum is null)
            {
                _currentLapNum = currentLapNum;
                _lastDrs = drs;
                return false;
            }

            // Lap rollover.
            if (currentLapNum != _currentLapNum.Value)
            {
                // Close any zone open across the start-finish line at fraction 1.0.
                if (_pendingZoneStart is float startFrac)
                {
                    AppendZoneIfValid(startFrac, 1f);
                    _pendingZoneStart = null;
                }

                if (!_lapInvalidSeen && _buffer.Count > 0)
                {
                    _hasPendingSave = true;
                    return true; // Ready to save
                }

                // Invalid lap or no zones detected — reset and try the next lap.
                _buffer = new List<DrsZoneRange>();
                _lapInvalidSeen = false;
                _currentLapNum = currentLapNum;

                // If the car is still in a DRS zone at the lap boundary, treat the new lap
                // as having started inside the zone so the continuation is captured when
                // drs flips to 0. Otherwise reset the latch so the next 0→1 edge is
                // detected normally.
                if (drs == 1)
                {
                    _pendingZoneStart = 0f;
                    _lastDrs = 1;
                }
                else
                {
                    _pendingZoneStart = null;
                    _lastDrs = 0;
                }

                return false;
            }

            // Within the same lap.
            if (currentLapInvalid != 0)
                _lapInvalidSeen = true;

            if (_lastDrs == 0 && drs == 1)
            {
                _pendingZoneStart = _currentLapFraction;
            }
            else if (_lastDrs == 1 && drs == 0 && _pendingZoneStart is float sf)
            {
                AppendZoneIfValid(sf, _currentLapFraction);
                _pendingZoneStart = null;
            }

            _lastDrs = drs;
            return false;
        }
    }

    /// <summary>
    /// Retrieves the completed capture so the caller can persist it.
    /// Returns <c>false</c> if nothing is pending.
    /// </summary>
    public bool TryTakeCompleted(out int trackId, out DrsZoneRange[] zones)
    {
        lock (_sync)
        {
            if (!_hasPendingSave || _trackId is null)
            {
                trackId = 0;
                zones = Array.Empty<DrsZoneRange>();
                return false;
            }

            trackId = _trackId.Value;
            zones = _buffer.ToArray();
            return true;
        }
    }

    /// <summary>
    /// Marks the track as resolved so capture stops and resets internal state.
    /// Call after successfully saving the zones.
    /// </summary>
    public void MarkSaved(int trackId)
    {
        lock (_sync)
        {
            _resolvedTracks.Add(trackId);
            ResetLocked();
        }
    }

    /// <summary>
    /// Marks the track as resolved without saving (e.g. after a failed save).
    /// </summary>
    public void MarkResolved(int trackId)
    {
        lock (_sync)
        {
            _resolvedTracks.Add(trackId);
            ResetLocked();
        }
    }

    /// <summary>
    /// Forgets that <paramref name="trackId"/> was resolved and clears any pending capture
    /// state, so the next valid lap on this track triggers a fresh capture. Used by the
    /// debug "Re-capture" button after the JSON entry for the track was deleted.
    /// </summary>
    public void Forget(int trackId)
    {
        lock (_sync)
        {
            _resolvedTracks.Remove(trackId);
            if (_trackId == trackId)
                ResetLocked();
        }
    }

    /// <summary>
    /// Snapshot of the current capture state, used by the debug UI.
    /// </summary>
    public CaptureStatus GetStatus()
    {
        lock (_sync)
        {
            return new CaptureStatus(
                ArmedTrackId: _trackId,
                CurrentLapFraction: _currentLapFraction,
                BufferedZoneCount: _buffer.Count,
                HasPendingSave: _hasPendingSave);
        }
    }

    public readonly record struct CaptureStatus(
        int? ArmedTrackId,
        float CurrentLapFraction,
        int BufferedZoneCount,
        bool HasPendingSave);

    private void AppendZoneIfValid(float start, float end)
    {
        var s = Math.Clamp(start, 0f, 1f);
        var e = Math.Clamp(end, 0f, 1f);
        if (e - s < MinZoneWidth) return;
        _buffer.Add(new DrsZoneRange(s, e));
    }

    private void ResetLocked()
    {
        _trackId = null;
        _trackLengthM = 0f;
        _currentLapNum = null;
        _lastDrs = 0;
        _lapInvalidSeen = false;
        _pendingZoneStart = null;
        _currentLapFraction = 0f;
        _buffer = new List<DrsZoneRange>();
        _hasPendingSave = false;
    }
}
