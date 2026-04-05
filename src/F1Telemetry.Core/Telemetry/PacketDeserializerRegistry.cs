namespace F1Telemetry.Telemetry;

/// <summary>
/// Holds all registered <see cref="IPacketDeserializer"/> instances keyed by packet id.
/// New game versions register their own deserializers here.
/// </summary>
public sealed class PacketDeserializerRegistry
{
    private readonly Dictionary<byte, IPacketDeserializer> _deserializers = new();

    public PacketDeserializerRegistry(IEnumerable<IPacketDeserializer> deserializers)
    {
        foreach (var d in deserializers)
            _deserializers[d.PacketId] = d;
    }

    public IPacketDeserializer? Get(byte packetId) =>
        _deserializers.GetValueOrDefault(packetId);
}
