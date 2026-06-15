namespace F1Telemetry.Packets;

public sealed class CarStatusData
{
    public byte TractionControl { get; set; }
    public byte AntiLockBrakes { get; set; }
    public byte FuelMix { get; set; }
    public byte FrontBrakeBias { get; set; }
    public byte PitLimiterStatus { get; set; }
    public float FuelInTank { get; set; }
    public float FuelCapacity { get; set; }
    public float FuelRemainingLaps { get; set; }
    public ushort MaxRpm { get; set; }
    public ushort IdleRpm { get; set; }
    public byte MaxGears { get; set; }
    public byte DrsAllowed { get; set; }
    public ushort DrsActivationDistance { get; set; }
    public byte ActualTyreCompound { get; set; }
    public byte VisualTyreCompound { get; set; }
    public byte TyresAgeLaps { get; set; }
    public sbyte VehicleFiaFlags { get; set; }
    public float EnginePowerIce { get; set; }
    public float EnginePowerMguK { get; set; }
    public float ErsStoreEnergy { get; set; }
    public byte ErsDeployMode { get; set; }
    public float ErsHarvestedThisLapMguK { get; set; }
    public float ErsHarvestedThisLapMguH { get; set; }
    /// <summary>Added in packet format 2026 (between MGU-H and DeployedThisLap). Stays 0 in 2025 logs.</summary>
    public float ErsHarvestLimitPerLap { get; set; }
    public float ErsDeployedThisLap { get; set; }
    public byte NetworkPaused { get; set; }
}

public sealed class CarStatusPacket
{
    public CarStatusData[] CarStatusDataItems { get; set; } = [];
}
