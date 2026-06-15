namespace F1Telemetry.Protocol;

/// <summary>
/// Per-format reference tables (track names, team names, etc.). One instance per
/// <see cref="IProtocolPlugin"/>. Lookups are immutable and shared across the process —
/// frontend mirrors the same tables in <c>wwwroot/js/formats/format{YYYY}.js</c>.
///
/// New optional dictionaries can be added without breaking older plugins because each
/// property has a safe empty default. Consumers should treat missing entries as "unknown"
/// rather than failing.
/// </summary>
public sealed class ProtocolLookups
{
    /// <summary>Track id → display name (e.g. <c>0 → "Melbourne"</c>).</summary>
    public IReadOnlyDictionary<int, string> TrackNames { get; init; }
        = new Dictionary<int, string>(0);

    /// <summary>Track id → ISO 3166-1 alpha-2 country code for the flag SVG.</summary>
    public IReadOnlyDictionary<int, string> TrackFlagIso2 { get; init; }
        = new Dictionary<int, string>(0);

    /// <summary>Team id → display name. Widened to <c>ushort</c> in format 2026 (was uint8 before).</summary>
    public IReadOnlyDictionary<ushort, string> TeamNames { get; init; }
        = new Dictionary<ushort, string>(0);

    /// <summary>Session type byte → (Name, Slug) — Slug is used for log filenames.</summary>
    public IReadOnlyDictionary<byte, (string Name, string Slug)> SessionTypes { get; init; }
        = new Dictionary<byte, (string, string)>(0);

    /// <summary>m_formula → display name.</summary>
    public IReadOnlyDictionary<byte, string> Formulas { get; init; }
        = new Dictionary<byte, string>(0);

    /// <summary>m_gameMode → display name.</summary>
    public IReadOnlyDictionary<byte, string> GameModes { get; init; }
        = new Dictionary<byte, string>(0);

    /// <summary>m_ruleSet → display name.</summary>
    public IReadOnlyDictionary<byte, string> Rulesets { get; init; }
        = new Dictionary<byte, string>(0);

    /// <summary>PENA penalty type byte → display name.</summary>
    public IReadOnlyDictionary<byte, string> PenaltyTypes { get; init; }
        = new Dictionary<byte, string>(0);

    /// <summary>PENA infringement type byte → display name.</summary>
    public IReadOnlyDictionary<byte, string> InfringementTypes { get; init; }
        = new Dictionary<byte, string>(0);

    /// <summary>
    /// teamId → preferred LiveryColour slot (0..3). Used when a team's primary colour is
    /// indistinguishable from another team (e.g. Haas '25 slot 0 is red — same hue as Ferrari).
    /// Missing entry means slot 0 (primary).
    /// </summary>
    public IReadOnlyDictionary<ushort, int> LiveryColourSlotOverrides { get; init; }
        = new Dictionary<ushort, int>(0);

    // -------------------- Lookup helpers with safe fallbacks --------------------
    // These mirror the static-class API the legacy F125TrackNames/F125SessionTypes/etc.
    // exposed, so callers can move from a global static to a format-aware Lookups
    // instance with a one-line change.

    /// <summary>Display name for a track id, or <c>"Track{id}"</c> if unknown.</summary>
    public string GetTrackName(int trackId) =>
        TrackNames.TryGetValue(trackId, out var name) ? name : $"Track{trackId}";

    /// <summary>ISO 3166-1 alpha-2 country code for the track flag SVG, or <c>null</c> if unknown.</summary>
    public string? GetTrackFlagIso2(int trackId) =>
        TrackFlagIso2.TryGetValue(trackId, out var iso) ? iso : null;

    /// <summary>Display name for a team id, or <c>"Team {id}"</c> if unknown.</summary>
    public string GetTeamName(ushort teamId) =>
        TeamNames.TryGetValue(teamId, out var name) ? name : $"Team {teamId}";

    /// <summary>Session type → display name, or <c>"Session{id}"</c> if unknown.</summary>
    public string GetSessionName(byte sessionType) =>
        SessionTypes.TryGetValue(sessionType, out var t) ? t.Name : $"Session{sessionType}";

    /// <summary>Session type → file-name slug, or <c>"session{id}"</c> if unknown.</summary>
    public string GetSessionSlug(byte sessionType) =>
        SessionTypes.TryGetValue(sessionType, out var t) ? t.Slug : $"session{sessionType}";

    /// <summary>
    /// Reverse: file-name slug → session display name, or <c>null</c> if unknown.
    /// Used by <c>/api/sessions</c> when synthesizing headers for old logs that have no embedded meta.
    /// Case-insensitive.
    /// </summary>
    public string? GetSessionNameBySlug(string slug)
    {
        foreach (var kv in SessionTypes)
        {
            if (string.Equals(kv.Value.Slug, slug, StringComparison.OrdinalIgnoreCase))
                return kv.Value.Name;
        }
        return null;
    }

    /// <summary>Formula byte → display name, or <c>"Formula {id}"</c> if unknown.</summary>
    public string GetFormulaName(byte formula) =>
        Formulas.TryGetValue(formula, out var name) ? name : $"Formula {formula}";

    /// <summary>Preferred livery-colour slot index for a team, or <c>0</c> (primary) if no override.</summary>
    public int GetLiveryColourSlot(ushort teamId) =>
        LiveryColourSlotOverrides.TryGetValue(teamId, out var idx) ? idx : 0;
}
