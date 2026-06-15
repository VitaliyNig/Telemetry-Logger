namespace F1Telemetry.Packets;

/// <summary>
/// Extended per-car telemetry introduced in packet format 2026 (PacketId 16) — hence
/// the "26" suffix. Conveys Active Aero state, Overtake-mode availability, and a "2026
/// regulations applicable" flag that distinguishes new-spec cars from classic content
/// shown in the same session.
///
/// Stays absent in 2025 streams — consumers should default to an empty packet object
/// when reading older sessions.
/// </summary>
public sealed class CarTelemetry26Data
{
    /// <summary>0 = Corner mode, 1 = Straight mode.</summary>
    public byte ActiveAeroMode { get; set; }
    /// <summary>0 = not available, 1 = available.</summary>
    public byte ActiveAeroAvailable { get; set; }
    /// <summary>0 = not available, otherwise distance in metres until activation.</summary>
    public ushort ActiveAeroActivationDistance { get; set; }
    /// <summary>0 = not available, 1 = available.</summary>
    public byte OvertakeAvailable { get; set; }
    /// <summary>0 = not active, 1 = active.</summary>
    public byte OvertakeActive { get; set; }
    /// <summary>0 = not available, otherwise distance in metres until activation.</summary>
    public ushort OvertakeActivationDistance { get; set; }
    /// <summary>0 = pre-2026 regulations, 1 = 2026 regulations applicable.</summary>
    public byte Regulations2026 { get; set; }
    /// <summary>Whether the car is driving the wrong way (1) or not (0).</summary>
    public byte DrivingWrongWay { get; set; }
}

public sealed class CarTelemetry26Packet
{
    public CarTelemetry26Data[] CarTelemetry26DataItems { get; set; } = [];
}
