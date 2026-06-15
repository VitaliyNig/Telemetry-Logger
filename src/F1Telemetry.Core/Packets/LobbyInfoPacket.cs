namespace F1Telemetry.Packets;

/// <summary>
/// Multiplayer lobby player record. <see cref="TeamId"/> was uint8 through format 2025 and
/// widened to uint16 in format 2026; the model stores it as <c>ushort</c> for both.
/// </summary>
public sealed class LobbyInfoData
{
    public byte AiControlled { get; set; }
    public ushort TeamId { get; set; }
    public byte Nationality { get; set; }
    public byte Platform { get; set; }
    public string Name { get; set; } = string.Empty;
    public byte CarNumber { get; set; }
    public byte YourTelemetry { get; set; }
    public byte ShowOnlineNames { get; set; }
    public ushort TechLevel { get; set; }
    public byte ReadyStatus { get; set; }
}

public sealed class LobbyInfoPacket
{
    public byte NumPlayers { get; set; }
    public LobbyInfoData[] LobbyPlayers { get; set; } = [];
}
