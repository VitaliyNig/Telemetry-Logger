using Microsoft.Extensions.DependencyInjection;

namespace F1Telemetry.Udp;

public static class TelemetryUdpServiceCollectionExtensions
{
    public static IServiceCollection AddTelemetryUdpListener(this IServiceCollection services)
    {
        services.AddHostedService<TelemetryUdpReceiveService>();
        return services;
    }
}
