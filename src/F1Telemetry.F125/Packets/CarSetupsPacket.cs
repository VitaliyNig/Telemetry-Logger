namespace F1Telemetry.F125.Packets;

public sealed class CarSetupData
{
    public byte FrontWing { get; set; }
    public byte RearWing { get; set; }
    public byte OnThrottle { get; set; }
    public byte OffThrottle { get; set; }
    public float FrontCamber { get; set; }
    public float RearCamber { get; set; }
    public float FrontToe { get; set; }
    public float RearToe { get; set; }
    public byte FrontSuspension { get; set; }
    public byte RearSuspension { get; set; }
    public byte FrontAntiRollBar { get; set; }
    public byte RearAntiRollBar { get; set; }
    public byte FrontSuspensionHeight { get; set; }
    public byte RearSuspensionHeight { get; set; }
    public byte BrakePressure { get; set; }
    public byte BrakeBias { get; set; }
    public byte EngineBraking { get; set; }
    public float RearLeftTyrePressure { get; set; }
    public float RearRightTyrePressure { get; set; }
    public float FrontLeftTyrePressure { get; set; }
    public float FrontRightTyrePressure { get; set; }
    public byte Ballast { get; set; }
    public float FuelLoad { get; set; }
}

public sealed class CarSetupsPacket
{
    public CarSetupData[] CarSetupData { get; set; } = [];
    public float NextFrontWingValue { get; set; }
}
