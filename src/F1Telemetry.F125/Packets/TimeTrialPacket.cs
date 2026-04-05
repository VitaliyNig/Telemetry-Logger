namespace F1Telemetry.F125.Packets;

public sealed class TimeTrialDataSet
{
    public byte CarIdx { get; set; }
    public byte TeamId { get; set; }
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
