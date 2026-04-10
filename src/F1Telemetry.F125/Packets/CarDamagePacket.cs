namespace F1Telemetry.F125.Packets;

public sealed class CarDamageData
{
    public float[] TyresWear { get; set; } = new float[4];
    public int[] TyresDamage { get; set; } = new int[4];
    public int[] BrakesDamage { get; set; } = new int[4];
    public int[] TyreBlisters { get; set; } = new int[4];
    public byte FrontLeftWingDamage { get; set; }
    public byte FrontRightWingDamage { get; set; }
    public byte RearWingDamage { get; set; }
    public byte FloorDamage { get; set; }
    public byte DiffuserDamage { get; set; }
    public byte SidepodDamage { get; set; }
    public byte DrsFault { get; set; }
    public byte ErsFault { get; set; }
    public byte GearBoxDamage { get; set; }
    public byte EngineDamage { get; set; }
    public byte EngineMguhWear { get; set; }
    public byte EngineEsWear { get; set; }
    public byte EngineCeWear { get; set; }
    public byte EngineIceWear { get; set; }
    public byte EngineMgukWear { get; set; }
    public byte EngineTcWear { get; set; }
    public byte EngineBlown { get; set; }
    public byte EngineSeized { get; set; }
}

public sealed class CarDamagePacket
{
    public CarDamageData[] CarDamageDataItems { get; set; } = [];
}
