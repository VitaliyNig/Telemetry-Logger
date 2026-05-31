namespace F1Telemetry.Host.Logging;

/// <summary>
/// Defines which colour slot (0-based index into ParticipantData.LiveryColours) to use
/// as the team accent colour for a given game year and team ID.
///
/// The game always provides colours as [primary, secondary, tertiary].
/// Most teams look best with slot 0, but some liveries have a problematic primary
/// (e.g. Haas F1 25: slot 0 is red, indistinguishable from Ferrari).
///
/// Add a new entry under the appropriate game year when a new season ships.
/// </summary>
public static class LiveryColourSelector
{
    // gameYear → (teamId → colour slot index)
    private static readonly Dictionary<byte, Dictionary<byte, int>> Overrides = new()
    {
        [25] = new Dictionary<byte, int>
        {
            [7] = 1, // Haas: slot 0 is red (same hue as Ferrari); use slot 1
        },
    };

    /// <summary>
    /// Returns the colour slot index to use for the given game year and team.
    /// Falls back to slot 0 (primary colour) when no override is configured.
    /// </summary>
    public static int GetIndex(byte gameYear, byte teamId)
    {
        if (Overrides.TryGetValue(gameYear, out var teamMap) &&
            teamMap.TryGetValue(teamId, out var idx))
            return idx;
        return 0;
    }
}
