namespace F1Telemetry.Packets;

public sealed class LiveryColour
{
    public byte Red { get; set; }
    public byte Green { get; set; }
    public byte Blue { get; set; }
}

/// <summary>
/// Per-driver info. <see cref="DriverId"/>, <see cref="NetworkId"/>, and <see cref="TeamId"/>
/// were uint8 through format 2025 and widened to uint16 in format 2026 (Season Pack); the
/// model stores them as <c>ushort</c> for both — older deserializers cast their uint8 reads up.
/// </summary>
public sealed class ParticipantData
{
    public byte AiControlled { get; set; }
    public ushort DriverId { get; set; }
    public ushort NetworkId { get; set; }
    public ushort TeamId { get; set; }
    public byte MyTeam { get; set; }
    public byte RaceNumber { get; set; }
    public byte Nationality { get; set; }
    public string Name { get; set; } = string.Empty;
    public byte YourTelemetry { get; set; }
    public byte ShowOnlineNames { get; set; }
    public ushort TechLevel { get; set; }
    public byte Platform { get; set; }
    public byte NumColours { get; set; }
    public LiveryColour[] LiveryColours { get; set; } = [];
}

public sealed class ParticipantsPacket
{
    public byte NumActiveCars { get; set; }
    public ParticipantData[] Participants { get; set; } = [];
}
