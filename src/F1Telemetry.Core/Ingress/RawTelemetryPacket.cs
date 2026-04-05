using System.Net;

namespace F1Telemetry.Ingress;

/// <summary>One UDP datagram as received from the game (payload is owned copy).</summary>
public sealed class RawTelemetryPacket
{
    public RawTelemetryPacket(DateTimeOffset receivedAt, IPEndPoint remoteEndPoint, byte[] payload)
    {
        ReceivedAt = receivedAt;
        RemoteEndPoint = remoteEndPoint;
        Payload = payload;
    }

    public DateTimeOffset ReceivedAt { get; }
    public IPEndPoint RemoteEndPoint { get; }
    public byte[] Payload { get; }
}
