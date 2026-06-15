using F1Telemetry.Protocol;
using F1Telemetry.State;
using Microsoft.AspNetCore.SignalR;

namespace F1Telemetry.Host.Hubs;

/// <summary>
/// SignalR hub for real-time telemetry data.
/// Clients connect here to receive live packet broadcasts.
/// </summary>
public sealed class TelemetryHub : Hub<ITelemetryClient>
{
    private readonly TelemetryState _state;
    private readonly LapSetupStore _lapSetupStore;
    private readonly LapTyreStore _lapTyreStore;
    private readonly ProtocolRegistry _registry;

    public TelemetryHub(
        TelemetryState state,
        LapSetupStore lapSetupStore,
        LapTyreStore lapTyreStore,
        ProtocolRegistry registry)
    {
        _state = state;
        _lapSetupStore = lapSetupStore;
        _lapTyreStore = lapTyreStore;
        _registry = registry;
    }

    /// <summary>Client can request current state snapshot on connect.</summary>
    public Dictionary<string, object> GetCurrentState()
    {
        var all = _state.GetAll();
        var result = new Dictionary<string, object>();
        foreach (var (key, value) in all)
        {
            var name = ResolvePacketName(key);
            result[name] = value;
        }
        return result;
    }

    /// <summary>Client can request all setup snapshots for a car on connect/reconnect.</summary>
    public Dictionary<int, object>? GetSetupSnapshots(byte carIndex)
    {
        var snapshots = _lapSetupStore.GetSnapshots(carIndex);
        if (snapshots == null || snapshots.Count == 0) return null;
        return new Dictionary<int, object>(snapshots);
    }

    /// <summary>Client can request all tyre snapshots for a car on connect/reconnect.</summary>
    public Dictionary<int, object>? GetTyreSnapshots(byte carIndex)
    {
        var snapshots = _lapTyreStore.GetSnapshots(carIndex);
        if (snapshots == null || snapshots.Count == 0) return null;
        return new Dictionary<int, object>(snapshots);
    }

    /// <summary>Cross-format packet-name resolver — see Program.ResolvePacketName for rationale.</summary>
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
