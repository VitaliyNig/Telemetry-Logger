using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2025.Deserializers;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2025;

/// <summary>
/// Packet format 2025 — the original F1 25 release. Wired into the host via
/// <c>services.AddProtocolFormat&lt;Format2025Plugin&gt;()</c>.
/// </summary>
public sealed class Format2025Plugin : IProtocolPlugin
{
    public ushort PacketFormat => 2025;
    public byte MaxCars => 22;
    public string DisplayName => "F1 25 (format 2025)";
    public string ConfigFormatToken => "2025";

    public ProtocolLookups Lookups { get; } = Format2025Lookups.Build();

    private readonly Dictionary<byte, IPacketDeserializer> _deserializers;
    private readonly IReadOnlyList<byte> _knownPacketIds;

    public Format2025Plugin()
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
