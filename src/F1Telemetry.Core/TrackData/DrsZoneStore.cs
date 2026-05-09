using System.Text.Json;

namespace F1Telemetry.TrackData;

/// <summary>
/// Loads and persists DRS zone fractions per track from <c>drs-zones.json</c>.
/// Thread-safe: loads are cached; saves invalidate the cache.
/// </summary>
public sealed class DrsZoneStore
{
    // Sanity thresholds for the on-load filter. Any track entry that fails either check
    // is treated as missing — ComputeLapPerf falls back to whole-lap DRS usage instead of
    // reporting figures derived from clearly broken zone data (e.g. fragmented captures
    // from older builds, or hand-typed placeholders).
    private const float MinPlausibleZoneWidth = 0.005f;  // <0.5 % of the lap → almost certainly a flicker, not a zone.
    private const float MinPlausibleTotalCoverage = 0.03f; // <3 % total → too sparse to represent a real DRS layout.

    private readonly string _path;
    private readonly object _lock = new();
    private Dictionary<int, (float Start, float End)[]>? _cache;

    public DrsZoneStore(string path)
    {
        _path = path;
    }

    public bool HasZones(int trackId)
    {
        var zones = Load();
        return zones.TryGetValue(trackId, out var z) && z.Length > 0;
    }

    public Dictionary<int, (float Start, float End)[]> Load()
    {
        lock (_lock)
        {
            if (_cache != null) return _cache;
            if (!File.Exists(_path))
            {
                _cache = new Dictionary<int, (float Start, float End)[]>();
                return _cache;
            }

            try
            {
                var json = File.ReadAllText(_path);
                var raw = JsonSerializer.Deserialize<Dictionary<string, List<List<float>>>>(json);
                if (raw == null)
                {
                    _cache = new Dictionary<int, (float Start, float End)[]>();
                    return _cache;
                }

                var parsed = new Dictionary<int, (float Start, float End)[]>();
                foreach (var (trackKey, zoneLists) in raw)
                {
                    if (!int.TryParse(trackKey, out var tid) || zoneLists == null)
                        continue;

                    var zones = new List<(float Start, float End)>();
                    var bogus = false;
                    var totalCoverage = 0f;
                    foreach (var z in zoneLists)
                    {
                        if (z == null || z.Count < 2) continue;
                        var start = Math.Clamp(z[0], 0f, 1f);
                        var end = Math.Clamp(z[1], 0f, 1f);
                        if (end <= start) continue;
                        var width = end - start;
                        if (width < MinPlausibleZoneWidth)
                        {
                            bogus = true;
                            break;
                        }
                        totalCoverage += width;
                        zones.Add((start, end));
                    }
                    if (bogus || zones.Count == 0 || totalCoverage < MinPlausibleTotalCoverage)
                        continue;
                    parsed[tid] = zones.ToArray();
                }

                _cache = parsed;
                return _cache;
            }
            catch
            {
                _cache = new Dictionary<int, (float Start, float End)[]>();
                return _cache;
            }
        }
    }

    /// <summary>
    /// Removes the entry for <paramref name="trackId"/> from the JSON file and invalidates
    /// the in-memory cache. Used by the debug "Re-capture" button. No-op when the track has
    /// no entry. Returns <c>true</c> if a write actually happened.
    /// </summary>
    public async Task<bool> DeleteTrackAsync(int trackId)
    {
        if (!File.Exists(_path)) return false;

        Dictionary<string, List<List<float>>> raw;
        try
        {
            var text = await File.ReadAllTextAsync(_path);
            raw = JsonSerializer.Deserialize<Dictionary<string, List<List<float>>>>(text)
                  ?? new Dictionary<string, List<List<float>>>();
        }
        catch
        {
            return false;
        }

        var key = trackId.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (!raw.Remove(key)) return false;

        var json = JsonSerializer.Serialize(raw, new JsonSerializerOptions { WriteIndented = true });
        var tmpPath = _path + ".tmp";
        await File.WriteAllTextAsync(tmpPath, json);
        File.Move(tmpPath, _path, overwrite: true);

        lock (_lock) { _cache = null; }
        return true;
    }

    public async Task SaveAsync(int trackId, IReadOnlyList<DrsZoneRange> zones)
    {
        Dictionary<string, List<List<float>>> raw;
        if (File.Exists(_path))
        {
            try
            {
                var text = await File.ReadAllTextAsync(_path);
                raw = JsonSerializer.Deserialize<Dictionary<string, List<List<float>>>>(text)
                      ?? new Dictionary<string, List<List<float>>>();
            }
            catch
            {
                raw = new Dictionary<string, List<List<float>>>();
            }
        }
        else
        {
            raw = new Dictionary<string, List<List<float>>>();
        }

        raw[trackId.ToString(System.Globalization.CultureInfo.InvariantCulture)] =
            zones.Select(z => new List<float> { z.Start, z.End }).ToList();

        var dir = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(dir) && !Directory.Exists(dir))
            Directory.CreateDirectory(dir);

        var json = JsonSerializer.Serialize(raw, new JsonSerializerOptions { WriteIndented = true });
        var tmpPath = _path + ".tmp";
        await File.WriteAllTextAsync(tmpPath, json);
        File.Move(tmpPath, _path, overwrite: true);

        lock (_lock)
        {
            _cache = null;
        }
    }
}
