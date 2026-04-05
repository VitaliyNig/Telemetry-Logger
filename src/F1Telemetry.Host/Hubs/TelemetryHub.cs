using Microsoft.AspNetCore.SignalR;

namespace F1Telemetry.Host.Hubs;

public sealed class TelemetryHub : Hub
{
    public override async Task OnConnectedAsync()
    {
        await base.OnConnectedAsync();
    }
}
