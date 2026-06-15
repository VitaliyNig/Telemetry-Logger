namespace F1Telemetry.Packets;

/// <summary>
/// Per-car wheel-and-engine telemetry. Originally introduced in F1 25 (packet id 6),
/// hence the "25" suffix. <see cref="EngineTemperature"/> is stored as <c>ushort</c>;
/// the wire encoding is uint16 in format 2025 and uint8 in format 2026 — either fits
/// without losing data.
/// </summary>
public sealed class CarTelemetry25Data
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

public sealed class CarTelemetry25Packet
{
    public CarTelemetry25Data[] CarTelemetry25Data { get; set; } = [];
    public byte MfdPanelIndex { get; set; }
    public byte MfdPanelIndexSecondaryPlayer { get; set; }
    public sbyte SuggestedGear { get; set; }
}
