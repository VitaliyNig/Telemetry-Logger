namespace F1Telemetry.Protocol.Format2026.Internal;

/// <summary>Values from the official F1 25: 2026 Season Pack UDP specification.
/// Format identifier bumped to 2026, max car count bumped to 24 to accommodate the new team.</summary>
internal static class Format2026Constants
{
    public const ushort ExpectedPacketFormat = 2026;
    public const int MaxCarsInUdpData = 24;
}
