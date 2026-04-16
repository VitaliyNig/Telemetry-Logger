using System.Net;

namespace F1Telemetry.Ingress;

/// <summary>One UDP datagram as received from the game.</summary>
public sealed class RawTelemetryPacket
{
    public RawTelemetryPacket(DateTimeOffset receivedAt, IPEndPoint remoteEndPoint, ReadOnlyMemory<byte> payload)
    {
        ReceivedAt = receivedAt;
        RemoteEndPoint = remoteEndPoint;
        Payload = payload;
    }

    public DateTimeOffset ReceivedAt { get; }
    public IPEndPoint RemoteEndPoint { get; }
    public ReadOnlyMemory<byte> Payload { get; }
}
