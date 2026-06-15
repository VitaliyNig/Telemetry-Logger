using F1Telemetry.Protocol;

namespace F1Telemetry.Host.Ingress;

/// <summary>
/// One-shot diagnostics tracker for the "missing samples on first laps" investigation.
/// Counts each gate in <see cref="TelemetryPipelineIngress"/> per packetId so we can
/// tell deterministically whether the loss happens BEFORE Enqueue (= kernel UDP drop,
/// deserializer null, format mismatch) or downstream. Snapshotted into the session JSON
/// on each WriteSession.
/// </summary>
public sealed class IngressDiagnosticsTracker
{
    private const int PacketTypes = 64; // F1 protocol formats use <32 packet ids; over-allocate.

    private readonly long[] _received = new long[PacketTypes];
    private readonly long[] _formatMismatch = new long[PacketTypes];
    private readonly long[] _noDeserializer = new long[PacketTypes];
    private readonly long[] _deserializerNull = new long[PacketTypes];
    private readonly long[] _deserializerThrew = new long[PacketTypes];
    private readonly long[] _enqueued = new long[PacketTypes];
    private readonly float[] _firstSessionTime = new float[PacketTypes];

    private long _headerFailedNoId;
    private readonly ProtocolRegistry _registry;

    public IngressDiagnosticsTracker(ProtocolRegistry registry)
    {
        _registry = registry;
        Array.Fill(_firstSessionTime, -1f);
    }

    public void RecordHeaderFailedUnknownId() => Interlocked.Increment(ref _headerFailedNoId);

    public void RecordReceived(byte packetId, float sessionTime)
    {
        if (packetId >= PacketTypes) return;
        Interlocked.Increment(ref _received[packetId]);
        // Cheap "first seen" tracker. A racy float write can mis-report by milliseconds
        // at most — fine for one-shot diagnostics.
        if (_firstSessionTime[packetId] < 0f)
            _firstSessionTime[packetId] = sessionTime;
    }

    public void RecordFormatMismatch(byte packetId)
    {
        if (packetId < PacketTypes) Interlocked.Increment(ref _formatMismatch[packetId]);
    }

    public void RecordNoDeserializer(byte packetId)
    {
        if (packetId < PacketTypes) Interlocked.Increment(ref _noDeserializer[packetId]);
    }

    public void RecordDeserializerNull(byte packetId)
    {
        if (packetId < PacketTypes) Interlocked.Increment(ref _deserializerNull[packetId]);
    }

    public void RecordDeserializerThrew(byte packetId)
    {
        if (packetId < PacketTypes) Interlocked.Increment(ref _deserializerThrew[packetId]);
    }

    public void RecordEnqueued(byte packetId)
    {
        if (packetId < PacketTypes) Interlocked.Increment(ref _enqueued[packetId]);
    }

    /// <summary>Snapshot per packet-id (only ids actually seen this run).</summary>
    public Dictionary<string, IngressPacketCounts> Snapshot()
    {
        var result = new Dictionary<string, IngressPacketCounts>();
        for (byte id = 0; id < PacketTypes; id++)
        {
            if (_received[id] == 0 && _formatMismatch[id] == 0 &&
                _noDeserializer[id] == 0 && _deserializerNull[id] == 0 &&
                _deserializerThrew[id] == 0 && _enqueued[id] == 0)
            {
                continue;
            }

            var name = ResolvePacketName(id);
            result[name] = new IngressPacketCounts
            {
                Received = Interlocked.Read(ref _received[id]),
                FormatMismatch = Interlocked.Read(ref _formatMismatch[id]),
                NoDeserializer = Interlocked.Read(ref _noDeserializer[id]),
                DeserializerNull = Interlocked.Read(ref _deserializerNull[id]),
                DeserializerThrew = Interlocked.Read(ref _deserializerThrew[id]),
                Enqueued = Interlocked.Read(ref _enqueued[id]),
                FirstSeenSessionTimeS = _firstSessionTime[id],
            };
        }
        return result;
    }

    public long HeaderFailedUnknownId => Interlocked.Read(ref _headerFailedNoId);

    /// <summary>Cross-format packet-name resolver — same logic as Program.ResolvePacketName.</summary>
    private string ResolvePacketName(byte packetId)
    {
        foreach (var p in _registry.All)
        {
            var name = p.GetPacketName(packetId);
            if (!byte.TryParse(name, out _)) return name;
        }
        return packetId.ToString();
    }
}

public sealed class IngressPacketCounts
{
    public long Received { get; set; }
    public long FormatMismatch { get; set; }
    public long NoDeserializer { get; set; }
    public long DeserializerNull { get; set; }
    public long DeserializerThrew { get; set; }
    public long Enqueued { get; set; }
    public float FirstSeenSessionTimeS { get; set; }
}
