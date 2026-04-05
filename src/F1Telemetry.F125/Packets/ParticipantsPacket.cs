namespace F1Telemetry.F125.Packets;

public sealed class LiveryColour
{
    public byte Red { get; set; }
    public byte Green { get; set; }
    public byte Blue { get; set; }
}

public sealed class ParticipantData
{
    public byte AiControlled { get; set; }
    public byte DriverId { get; set; }
    public byte NetworkId { get; set; }
    public byte TeamId { get; set; }
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
