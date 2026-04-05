using F1Telemetry.Telemetry;

namespace F1Telemetry.Host.Hubs;

/// <summary>Strongly-typed SignalR client interface for telemetry broadcasts.</summary>
public interface ITelemetryClient
{
    Task ReceivePacket(string packetType, TelemetryPacketHeader header, object data);
    Task DebugPacket(object data);
}
