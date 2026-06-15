using F1Telemetry.Protocol;

namespace F1Telemetry.Protocol.Format2026;

/// <summary>
/// Builds the <see cref="ProtocolLookups"/> bundle for packet format 2026 — the 2026
/// Season Pack DLC for F1 25. New additions over 2025:
/// - Track id 42 = Madrid.
/// - Team ids 465-475 ('25 F2) and 476-486 ('26 F1 including Audi 485, Cadillac 486).
/// </summary>
internal static class Format2026Lookups
{
    public static ProtocolLookups Build() => new()
    {
        TrackNames = TrackNames,
        TrackFlagIso2 = TrackFlagIso2,
        TeamNames = TeamNames,
        SessionTypes = SessionTypes,
        Formulas = Formulas,
        GameModes = GameModes,
        Rulesets = Rulesets,
        PenaltyTypes = PenaltyTypes,
        InfringementTypes = InfringementTypes,
        LiveryColourSlotOverrides = LiveryColourSlotOverrides,
    };

    private static readonly IReadOnlyDictionary<int, string> TrackNames =
        new Dictionary<int, string>
        {
            [0]  = "Melbourne",       [2]  = "Shanghai",      [3]  = "Sakhir",
            [4]  = "Catalunya",       [5]  = "Monaco",        [6]  = "Montreal",
            [7]  = "Silverstone",     [9]  = "Hungaroring",   [10] = "Spa",
            [11] = "Monza",           [12] = "Singapore",     [13] = "Suzuka",
            [14] = "Abu Dhabi",       [15] = "Texas",         [16] = "Brazil",
            [17] = "Austria",         [19] = "Mexico",        [20] = "Baku",
            [26] = "Zandvoort",       [27] = "Imola",         [29] = "Jeddah",
            [30] = "Miami",           [31] = "Las Vegas",     [32] = "Losail",
            [39] = "Silverstone (R)", [40] = "Austria (R)",   [41] = "Zandvoort (R)",
            [42] = "Madrid",
        };

    private static readonly IReadOnlyDictionary<int, string> TrackFlagIso2 =
        new Dictionary<int, string>
        {
            [0]  = "AU", [2]  = "CN", [3]  = "BH", [4]  = "ES",
            [5]  = "MC", [6]  = "CA", [7]  = "GB", [9]  = "HU",
            [10] = "BE", [11] = "IT", [12] = "SG", [13] = "JP",
            [14] = "AE", [15] = "US", [16] = "BR", [17] = "AT",
            [19] = "MX", [20] = "AZ", [26] = "NL", [27] = "IT",
            [29] = "SA", [30] = "US", [31] = "US", [32] = "QA",
            [39] = "GB", [40] = "AT", [41] = "NL",
            [42] = "ES", // Madrid
        };

    // Format 2026 widens teamId to uint16. New teams: 465-475 ('25 F2), 476-486 ('26 F1).
    private static readonly IReadOnlyDictionary<ushort, string> TeamNames =
        new Dictionary<ushort, string>
        {
            [0] = "Mercedes",      [1] = "Ferrari",        [2] = "Red Bull Racing",
            [3] = "Williams",      [4] = "Aston Martin",   [5] = "Alpine",
            [6] = "RB",            [7] = "Haas",           [8] = "McLaren",
            [9] = "Sauber",
            [41] = "F1 Generic",   [104] = "F1 Custom Team", [129] = "Konnersport",
            [142] = "APXGP '24",   [154] = "APXGP '25",      [155] = "Konnersport '24",
            [158] = "Art GP '24",  [159] = "Campos '24",     [160] = "Rodin Motorsport '24",
            [161] = "AIX Racing '24", [162] = "DAMS '24",    [163] = "Hitech '24",
            [164] = "MP Motorsport '24", [165] = "Prema '24", [166] = "Trident '24",
            [167] = "Van Amersfoort '24", [168] = "Invicta '24",
            [185] = "Mercedes '24",[186] = "Ferrari '24",  [187] = "Red Bull Racing '24",
            [188] = "Williams '24",[189] = "Aston Martin '24", [190] = "Alpine '24",
            [191] = "RB '24",      [192] = "Haas '24",     [193] = "McLaren '24",
            [194] = "Sauber '24",
            // F2 2025
            [465] = "Art GP '25",            [466] = "Campos '25",
            [467] = "Rodin Motorsport '25",  [468] = "AIX Racing '25",
            [469] = "DAMS '25",              [470] = "Hitech '25",
            [471] = "MP Motorsport '25",     [472] = "Prema '25",
            [473] = "Trident '25",           [474] = "Van Amersfoort Racing '25",
            [475] = "Invicta '25",
            // F1 2026 with two new teams
            [476] = "Mercedes '26",          [477] = "Ferrari '26",
            [478] = "Red Bull Racing '26",   [479] = "Williams '26",
            [480] = "Aston Martin '26",      [481] = "Alpine '26",
            [482] = "RB '26",                [483] = "Haas '26",
            [484] = "McLaren '26",           [485] = "Audi '26",
            [486] = "Cadillac '26",
        };

    private static readonly IReadOnlyDictionary<byte, (string Name, string Slug)> SessionTypes =
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
        };

    // Format 2026 spec adds 13 = "F1 26" alongside the existing formula ids.
    private static readonly IReadOnlyDictionary<byte, string> Formulas =
        new Dictionary<byte, string>
        {
            [0] = "F1 Modern",  [1] = "F1 Classic",  [2] = "F2",
            [3] = "F1 Generic", [4] = "Beta",        [6] = "Esports",
            [8] = "F1 World",   [9] = "F1 Elimination",
            [13] = "F1 26",
        };

    private static readonly IReadOnlyDictionary<byte, string> GameModes =
        new Dictionary<byte, string>
        {
            [4]  = "Grand Prix '23",         [5]  = "Time Trial",
            [6]  = "Splitscreen",            [7]  = "Online Custom",
            [15] = "Online Weekly Event",    [17] = "Story Mode (Braking Point)",
            [27] = "My Team Career '25",     [28] = "Driver Career '25",
            [29] = "Career '25 Online",      [30] = "Challenge Career '25",
            [75] = "Story Mode (APXGP)",     [127] = "Benchmark",
        };

    private static readonly IReadOnlyDictionary<byte, string> Rulesets =
        new Dictionary<byte, string>
        {
            [0] = "Practice & Qualifying", [1] = "Race",
            [2] = "Time Trial",            [12] = "Elimination",
        };

    private static readonly IReadOnlyDictionary<byte, string> PenaltyTypes =
        new Dictionary<byte, string>
        {
            [0] = "Drive through",      [1] = "Stop Go",
            [2] = "Grid penalty",       [3] = "Penalty reminder",
            [4] = "Time penalty",       [5] = "Warning",
            [6] = "Disqualified",       [7] = "Removed from formation lap",
            [8] = "Parked too long timer", [9] = "Tyre regulations",
            [10] = "This lap invalidated",
            [11] = "This and next lap invalidated",
            [12] = "This lap invalidated without reason",
            [13] = "This and next lap invalidated without reason",
            [14] = "This and previous lap invalidated",
            [15] = "This and previous lap invalidated without reason",
            [16] = "Retired",           [17] = "Black flag timer",
        };

    private static readonly IReadOnlyDictionary<byte, string> InfringementTypes =
        new Dictionary<byte, string>
        {
            [0] = "Blocking by slow driving",
            [1] = "Blocking by wrong way driving",
            [2] = "Reversing off the start line",
            [3] = "Big Collision",                  [4] = "Small Collision",
            [5] = "Collision failed to hand back position (single)",
            [6] = "Collision failed to hand back position (multiple)",
            [7] = "Corner cutting gained time",
            [8] = "Corner cutting overtake single",
            [9] = "Corner cutting overtake multiple",
            [10] = "Crossed pit exit lane",        [11] = "Ignoring blue flags",
            [12] = "Ignoring yellow flags",        [13] = "Ignoring drive through",
            [14] = "Too many drive throughs",
            [15] = "Drive through reminder serve within n laps",
            [16] = "Drive through reminder serve this lap",
            [17] = "Pit lane speeding",             [18] = "Parked for too long",
            [19] = "Ignoring tyre regulations",     [20] = "Too many penalties",
            [21] = "Multiple warnings",
            [22] = "Approaching disqualification",
            [23] = "Tyre regulations select single",
            [24] = "Tyre regulations select multiple",
            [25] = "Lap invalidated corner cutting",
            [26] = "Lap invalidated running wide",
            [27] = "Corner cutting ran wide gained time minor",
            [28] = "Corner cutting ran wide gained time significant",
            [29] = "Corner cutting ran wide gained time extreme",
            [30] = "Lap invalidated wall riding",
            [31] = "Lap invalidated flashback used",
            [32] = "Lap invalidated reset to track",
            [33] = "Blocking the pitlane",          [34] = "Jump start",
            [35] = "Safety car to car collision",
            [36] = "Safety car illegal overtake",
            [37] = "Safety car exceeding allowed pace",
            [38] = "Virtual safety car exceeding allowed pace",
            [39] = "Formation lap below allowed speed",
            [40] = "Formation lap parking",
            [41] = "Retired mechanical failure",
            [42] = "Retired terminally damaged",
            [43] = "Safety car falling too far back",
            [44] = "Black flag timer",              [45] = "Unserved stop go penalty",
            [46] = "Unserved drive through penalty",
            [47] = "Engine component change",       [48] = "Gearbox change",
            [49] = "Parc Fermé change",             [50] = "League grid penalty",
            [51] = "Retry penalty",                 [52] = "Illegal time gain",
            [53] = "Mandatory pitstop",             [54] = "Attribute assigned",
        };

    // No overrides for 2026 by default — Audi/Cadillac liveries TBD. Carry the Haas-1 hint
    // from 2025 only if their format-2026 livery still puts red on slot 0; revisit once
    // real captured packets reveal the actual colour palette.
    private static readonly IReadOnlyDictionary<ushort, int> LiveryColourSlotOverrides =
        new Dictionary<ushort, int>(0);
}
