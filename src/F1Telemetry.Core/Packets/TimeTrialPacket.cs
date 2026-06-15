namespace F1Telemetry.Packets;

/// <summary>
/// One Time Trial data set (player best / personal best / rival). <see cref="TeamId"/>
/// was uint8 through format 2025 and widened to uint16 in format 2026; the model stores
/// it as <c>ushort</c> for both.
/// </summary>
public sealed class TimeTrialDataSet
{
    public byte CarIdx { get; set; }
    public ushort TeamId { get; set; }
    public uint LapTimeInMs { get; set; }
    public uint Sector1TimeInMs { get; set; }
    public uint Sector2TimeInMs { get; set; }
    public uint Sector3TimeInMs { get; set; }
    public byte TractionControl { get; set; }
    public byte GearboxAssist { get; set; }
    public byte AntiLockBrakes { get; set; }
    public byte EqualCarPerformance { get; set; }
    public byte CustomSetup { get; set; }
    public byte Valid { get; set; }
}

public sealed class TimeTrialPacket
{
    public TimeTrialDataSet PlayerSessionBestDataSet { get; set; } = new();
    public TimeTrialDataSet PersonalBestDataSet { get; set; } = new();
    public TimeTrialDataSet RivalDataSet { get; set; } = new();
}
