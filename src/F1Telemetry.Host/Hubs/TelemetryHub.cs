using F1Telemetry.F125.Protocol;
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

    public TelemetryHub(TelemetryState state)
    {
        _state = state;
    }

    /// <summary>Client can request current state snapshot on connect.</summary>
    public Dictionary<string, object> GetCurrentState()
    {
        var all = _state.GetAll();
        var result = new Dictionary<string, object>();
        foreach (var (key, value) in all)
        {
            var name = ((F125PacketId)key).ToString();
            result[name] = value;
        }
        return result;
    }
}
