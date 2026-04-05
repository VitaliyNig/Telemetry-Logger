namespace F1Telemetry.F125.Protocol;

/// <summary>Values from the official F1 25 UDP specification (see docs/ in the repository).</summary>
public static class F125Constants
{
    public const ushort ExpectedPacketFormat = 2025;
    public const byte ExpectedGameYear = 25;
    public const int MaxCarsInUdpData = 22;
}
