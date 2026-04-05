namespace F1Telemetry.F125.Packets;

public sealed class MotionExPacket
{
    public float[] SuspensionPosition { get; set; } = new float[4];
    public float[] SuspensionVelocity { get; set; } = new float[4];
    public float[] SuspensionAcceleration { get; set; } = new float[4];
    public float[] WheelSpeed { get; set; } = new float[4];
    public float[] WheelSlipRatio { get; set; } = new float[4];
    public float[] WheelSlipAngle { get; set; } = new float[4];
    public float[] WheelLatForce { get; set; } = new float[4];
    public float[] WheelLongForce { get; set; } = new float[4];
    public float HeightOfCogAboveGround { get; set; }
    public float LocalVelocityX { get; set; }
    public float LocalVelocityY { get; set; }
    public float LocalVelocityZ { get; set; }
    public float AngularVelocityX { get; set; }
    public float AngularVelocityY { get; set; }
    public float AngularVelocityZ { get; set; }
    public float AngularAccelerationX { get; set; }
    public float AngularAccelerationY { get; set; }
    public float AngularAccelerationZ { get; set; }
    public float FrontWheelsAngle { get; set; }
    public float[] WheelVertForce { get; set; } = new float[4];
    public float FrontAeroHeight { get; set; }
    public float RearAeroHeight { get; set; }
    public float FrontRollAngle { get; set; }
    public float RearRollAngle { get; set; }
    public float ChassisYaw { get; set; }
    public float ChassisPitch { get; set; }
    public float[] WheelCamber { get; set; } = new float[4];
    public float[] WheelCamberGain { get; set; } = new float[4];
}
