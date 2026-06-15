using F1Telemetry.Telemetry;
using Microsoft.Extensions.DependencyInjection;

namespace F1Telemetry.Protocol;

/// <summary>
/// DI helpers for assembling the multi-format protocol stack. The Host calls these once
/// at startup; nobody else should need to touch DI for protocol concerns.
///
/// <code>
/// builder.Services
///     .AddF1Protocol()
///     .AddProtocolFormat&lt;Format2025Plugin&gt;()
///     .AddProtocolFormat&lt;Format2026Plugin&gt;();
/// </code>
/// </summary>
public static class F1ProtocolServiceCollectionExtensions
{
    /// <summary>
    /// Registers the format-neutral pieces: <see cref="ProtocolRegistry"/>,
    /// <see cref="IPacketHeaderReader"/>. Must be called before any
    /// <see cref="AddProtocolFormat{TPlugin}"/> calls.
    /// </summary>
    public static IServiceCollection AddF1Protocol(this IServiceCollection services)
    {
        services.AddSingleton<ProtocolRegistry>();
        services.AddSingleton<IPacketHeaderReader, PacketHeaderReader>();
        return services;
    }

    /// <summary>
    /// Registers one game-year plugin. Internally the plugin owns its own deserializer
    /// instances; nothing leaks into the global DI graph except the <see cref="IProtocolPlugin"/>
    /// itself, so multiple formats coexist without packet-id collisions.
    /// </summary>
    public static IServiceCollection AddProtocolFormat<TPlugin>(this IServiceCollection services)
        where TPlugin : class, IProtocolPlugin
    {
        services.AddSingleton<IProtocolPlugin, TPlugin>();
        return services;
    }
}
