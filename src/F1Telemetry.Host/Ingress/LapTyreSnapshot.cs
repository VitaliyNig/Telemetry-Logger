namespace F1Telemetry.Host.Ingress;

/// <summary>
/// Per-lap tyre snapshot captured at the moment a lap completes.
/// Sent to clients so the Lap Times widget can show tyre compound + wear for each race lap.
/// </summary>
public sealed class LapTyreSnapshot
{
    public byte ActualTyreCompound { get; set; }
    public byte VisualTyreCompound { get; set; }
    public byte TyresAgeLaps { get; set; }
    public float[] TyresWear { get; set; } = new float[4];
}
