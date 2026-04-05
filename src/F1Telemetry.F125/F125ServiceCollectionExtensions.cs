using F1Telemetry.F125.Deserializers;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;
using Microsoft.Extensions.DependencyInjection;

namespace F1Telemetry.F125;

public static class F125ServiceCollectionExtensions
{
    /// <summary>
    /// Registers all F1 25 protocol services: header reader and all packet deserializers.
    /// For future game versions, create a similar extension in a new assembly.
    /// </summary>
    public static IServiceCollection AddF125Protocol(this IServiceCollection services)
    {
        services.AddSingleton<IPacketHeaderReader, F125PacketHeaderReader>();

        services.AddSingleton<IPacketDeserializer, MotionPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, SessionPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, LapDataPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, EventPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, ParticipantsPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, CarSetupsPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, CarTelemetryPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, CarStatusPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, FinalClassificationPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, LobbyInfoPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, CarDamagePacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, SessionHistoryPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, TyreSetsPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, MotionExPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, TimeTrialPacketDeserializer>();
        services.AddSingleton<IPacketDeserializer, LapPositionsPacketDeserializer>();

        services.AddSingleton<PacketDeserializerRegistry>();

        return services;
    }
}
