namespace F1Telemetry.F125.Packets;

public sealed class CarTelemetryData
{
    public ushort Speed { get; set; }
    public float Throttle { get; set; }
    public float Steer { get; set; }
    public float Brake { get; set; }
    public byte Clutch { get; set; }
    public sbyte Gear { get; set; }
    public ushort EngineRpm { get; set; }
    public byte Drs { get; set; }
    public byte RevLightsPercent { get; set; }
    public ushort RevLightsBitValue { get; set; }
    public ushort[] BrakesTemperature { get; set; } = new ushort[4];
    /// <summary>°C per wheel; stored as ushort so JSON is a numeric array (byte[] becomes base64 and breaks the web UI).</summary>
    public ushort[] TyresSurfaceTemperature { get; set; } = new ushort[4];
    public ushort[] TyresInnerTemperature { get; set; } = new ushort[4];
    public ushort EngineTemperature { get; set; }
    public float[] TyresPressure { get; set; } = new float[4];
    public int[] SurfaceType { get; set; } = new int[4];
}

public sealed class CarTelemetryPacket
{
    public CarTelemetryData[] CarTelemetryData { get; set; } = [];
    public byte MfdPanelIndex { get; set; }
    public byte MfdPanelIndexSecondaryPlayer { get; set; }
    public sbyte SuggestedGear { get; set; }
}
