namespace F1Telemetry.Protocol;

/// <summary>
/// Packet identifier carried in <c>m_packetId</c> of the UDP header. These values are part of
/// the F1 UDP specification and are stable across game years, so they live in Core rather than
/// in any one format plugin. Ids 0–15 exist in every supported format; <see cref="CarTelemetry26"/>
/// (16) is new in format 2026 and is simply never emitted by older formats.
/// </summary>
public enum F1PacketId : byte
{
    Motion = 0,
    Session = 1,
    LapData = 2,
    Event = 3,
    Participants = 4,
    CarSetups = 5,
    CarTelemetry25 = 6,
    CarStatus = 7,
    FinalClassification = 8,
    LobbyInfo = 9,
    CarDamage = 10,
    SessionHistory = 11,
    TyreSets = 12,
    MotionEx = 13,
    TimeTrial = 14,
    LapPositions = 15,

    /// <summary>New in format 2026: Active Aero / Overtake-mode / 2026 regulations / wrong-way flag.</summary>
    CarTelemetry26 = 16,
}
