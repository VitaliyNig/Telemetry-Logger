using System.Collections.Frozen;

namespace F1Telemetry.F125.Protocol;

/// <summary>Track ID → human-readable name mapping (mirrors JS TRACK_NAMES).</summary>
public static class F125TrackNames
{
    private static readonly FrozenDictionary<int, string> Names = new Dictionary<int, string>
    {
        [0]  = "Melbourne",
        [2]  = "Shanghai",
        [3]  = "Sakhir",
        [4]  = "Catalunya",
        [5]  = "Monaco",
        [6]  = "Montreal",
        [7]  = "Silverstone",
        [9]  = "Hungaroring",
        [10] = "Spa",
        [11] = "Monza",
        [12] = "Singapore",
        [13] = "Suzuka",
        [14] = "Abu Dhabi",
        [15] = "Texas",
        [16] = "Brazil",
        [17] = "Austria",
        [19] = "Mexico",
        [20] = "Baku",
        [26] = "Zandvoort",
        [27] = "Imola",
        [29] = "Jeddah",
        [30] = "Miami",
        [31] = "Las Vegas",
        [32] = "Losail",
        [39] = "Silverstone (R)",
        [40] = "Austria (R)",
        [41] = "Zandvoort (R)",
    }.ToFrozenDictionary();

    public static string Get(int trackId) =>
        Names.TryGetValue(trackId, out var name) ? name : $"Track{trackId}";
}
