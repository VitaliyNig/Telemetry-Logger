namespace F1Telemetry.F125.Packets;

public sealed class LobbyInfoData
{
    public byte AiControlled { get; set; }
    public byte TeamId { get; set; }
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
