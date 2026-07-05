using F1Telemetry.Telemetry;

namespace F1Telemetry.Host.Hubs;

/// <summary>Strongly-typed SignalR client interface for telemetry broadcasts.</summary>
public interface ITelemetryClient
{
    Task ReceivePacket(string packetType, TelemetryPacketHeader header, object data);
    Task ReceiveSetupSnapshot(byte carIndex, int lapIndex, object setup);
    Task ReceiveTyreSnapshot(byte carIndex, int lapIndex, object snapshot);
    /// <summary>Coalesced world positions for the live Track Map widget: [x,y,z] per car,
    /// ~10 Hz (Motion itself is deliberately not broadcast live — too heavy at 60 Hz).</summary>
    Task ReceiveCarPositions(float[][] positions);
    Task DebugPacket(object data);
}
