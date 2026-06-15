using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Deserializers;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026;

/// <summary>
/// Packet format 2026 — the F1 25 "2026 Season Pack" DLC. Wired into the host via
/// <c>services.AddProtocolFormat&lt;Format2026Plugin&gt;()</c>.
/// </summary>
public sealed class Format2026Plugin : IProtocolPlugin
{
    public ushort PacketFormat => 2026;
    public byte MaxCars => 24;
    public string DisplayName => "F1 25 (2026 Season Pack, format 2026)";
    public string ConfigFormatToken => "2026";

    public ProtocolLookups Lookups { get; } = Format2026Lookups.Build();

    private readonly Dictionary<byte, IPacketDeserializer> _deserializers;
    private readonly IReadOnlyList<byte> _knownPacketIds;

    public Format2026Plugin()
    {
        var list = new IPacketDeserializer[]
        {
            new MotionPacketDeserializer(),
            new SessionPacketDeserializer(),
            new LapDataPacketDeserializer(),
            new EventPacketDeserializer(),
            new ParticipantsPacketDeserializer(),
            new CarSetupsPacketDeserializer(),
            new CarTelemetry25PacketDeserializer(),
            new CarStatusPacketDeserializer(),
            new FinalClassificationPacketDeserializer(),
            new LobbyInfoPacketDeserializer(),
            new CarDamagePacketDeserializer(),
            new SessionHistoryPacketDeserializer(),
            new TyreSetsPacketDeserializer(),
            new MotionExPacketDeserializer(),
            new TimeTrialPacketDeserializer(),
            new LapPositionsPacketDeserializer(),
            new CarTelemetry26PacketDeserializer(),
        };
        _deserializers = list.ToDictionary(d => d.PacketId);
        _knownPacketIds = _deserializers.Keys.OrderBy(b => b).ToArray();
    }

    public IPacketDeserializer? GetDeserializer(byte packetId) =>
        _deserializers.GetValueOrDefault(packetId);

    public string GetPacketName(byte packetId) =>
        Enum.IsDefined(typeof(F1PacketId), packetId)
            ? ((F1PacketId)packetId).ToString()
            : packetId.ToString();

    public IReadOnlyList<byte> KnownPacketIds => _knownPacketIds;
}
