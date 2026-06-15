namespace F1Telemetry.Packets;

/// <summary>
/// Motion data for one car. Identical layout across formats 2025 and 2026 from a
/// consumer's point of view; only the wire encoding of g-forces changed (float in 2025,
/// int16 quantised by 1000 in 2026 — the format-specific deserializer normalises
/// to float here).
/// </summary>
public sealed class CarMotionData
{
    public float WorldPositionX { get; set; }
    public float WorldPositionY { get; set; }
    public float WorldPositionZ { get; set; }
    public float WorldVelocityX { get; set; }
    public float WorldVelocityY { get; set; }
    public float WorldVelocityZ { get; set; }
    public short WorldForwardDirX { get; set; }
    public short WorldForwardDirY { get; set; }
    public short WorldForwardDirZ { get; set; }
    public short WorldRightDirX { get; set; }
    public short WorldRightDirY { get; set; }
    public short WorldRightDirZ { get; set; }
    public float GForceLateral { get; set; }
    public float GForceLongitudinal { get; set; }
    public float GForceVertical { get; set; }
    public float Yaw { get; set; }
    public float Pitch { get; set; }
    public float Roll { get; set; }
}

public sealed class MotionPacket
{
    public CarMotionData[] CarMotionData { get; set; } = [];
}
