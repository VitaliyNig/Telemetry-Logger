using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol;

/// <summary>
/// One year of F1 UDP protocol (e.g. 2025, 2026, future 2027). Each plugin owns the
/// packet-format identifier, the per-packet deserializer set, the maximum number of cars,
/// and the per-format reference tables.
///
/// Adding a new game year is a pure-additive operation: create a new assembly that exports
/// one <see cref="IProtocolPlugin"/> and register it via
/// <c>services.AddProtocolFormat&lt;NewPlugin&gt;()</c> in <c>Program.cs</c>. No core changes.
/// </summary>
public interface IProtocolPlugin
{
    /// <summary>Value found in <c>m_packetFormat</c> of the UDP header — e.g. 2025, 2026.</summary>
    ushort PacketFormat { get; }

    /// <summary>Maximum number of cars in fixed-size arrays in this format. 22 in 2025, 24 in 2026.</summary>
    byte MaxCars { get; }

    /// <summary>Human-readable name for diagnostics and the Settings tab — e.g. "F1 25 (2026 Season Pack)".</summary>
    string DisplayName { get; }

    /// <summary>
    /// Token written to <c>hardware_settings_config.xml</c> via <c>/api/game/configure-udp</c>.
    /// Matches the in-game UDP Format selector — e.g. <c>"2025"</c>, <c>"2026"</c>.
    /// </summary>
    string ConfigFormatToken { get; }

    /// <summary>Per-format reference tables (track / team / session names, etc.).</summary>
    ProtocolLookups Lookups { get; }

    /// <summary>
    /// Returns the deserializer for the given packet id, or <c>null</c> if the format does
    /// not know about it (e.g. <c>CarTelemetry2 = 16</c> in format 2025).
    /// </summary>
    IPacketDeserializer? GetDeserializer(byte packetId);

    /// <summary>Display name for the packet id — falls back to numeric string when unknown.</summary>
    string GetPacketName(byte packetId);

    /// <summary>All known packet ids for this format, in numeric order.</summary>
    IReadOnlyList<byte> KnownPacketIds { get; }
}
