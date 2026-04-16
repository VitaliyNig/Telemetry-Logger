using System.Collections.Frozen;

namespace F1Telemetry.F125.Protocol;

/// <summary>Session type → display name and file name slug.</summary>
public static class F125SessionTypes
{
    private static readonly FrozenDictionary<byte, (string Name, string Slug)> Types =
        new Dictionary<byte, (string, string)>
        {
            [0]  = ("Unknown",                  "unknown"),
            [1]  = ("Practice 1",               "fp1"),
            [2]  = ("Practice 2",               "fp2"),
            [3]  = ("Practice 3",               "fp3"),
            [4]  = ("Short Practice",           "short_practice"),
            [5]  = ("Qualifying 1",             "q1"),
            [6]  = ("Qualifying 2",             "q2"),
            [7]  = ("Qualifying 3",             "q3"),
            [8]  = ("Short Qualifying",         "short_qualifying"),
            [9]  = ("One-Shot Qualifying",      "osq"),
            [10] = ("Sprint Shootout 1",        "sprint_shootout1"),
            [11] = ("Sprint Shootout 2",        "sprint_shootout2"),
            [12] = ("Sprint Shootout 3",        "sprint_shootout3"),
            [13] = ("Short Sprint Shootout",    "short_sprint_shootout"),
            [14] = ("One-Shot Sprint Shootout", "oss"),
            [15] = ("Race",                     "race"),
            [16] = ("Race 2",                   "race2"),
            [17] = ("Race 3",                   "race3"),
            [18] = ("Time Trial",               "time_trial"),
        }.ToFrozenDictionary();

    public static string GetName(byte sessionType) =>
        Types.TryGetValue(sessionType, out var t) ? t.Name : $"Session{sessionType}";

    public static string GetSlug(byte sessionType) =>
        Types.TryGetValue(sessionType, out var t) ? t.Slug : $"session{sessionType}";
}
