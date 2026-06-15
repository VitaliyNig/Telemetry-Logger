namespace F1Telemetry.Protocol;

/// <summary>
/// Collects every registered <see cref="IProtocolPlugin"/> and dispatches by
/// <c>m_packetFormat</c>. Singleton; populated at startup via DI.
///
/// If <see cref="Get"/> returns <c>null</c>, the pipeline drops the packet with a warning —
/// it means a UDP datagram arrived for a format the user has not opted into.
/// </summary>
public sealed class ProtocolRegistry
{
    private readonly Dictionary<ushort, IProtocolPlugin> _byFormat;
    private readonly IReadOnlyList<IProtocolPlugin> _ordered;

    public ProtocolRegistry(IEnumerable<IProtocolPlugin> plugins)
    {
        _byFormat = new Dictionary<ushort, IProtocolPlugin>();
        foreach (var p in plugins)
            _byFormat[p.PacketFormat] = p;

        // Newest format first so fallback walks descending (e.g. log saved as 2027 with no
        // 2027 plugin loaded falls back to 2026 → 2025).
        _ordered = _byFormat.Values.OrderByDescending(p => p.PacketFormat).ToArray();
    }

    /// <summary>Exact match by packet format. Returns <c>null</c> for unsupported formats.</summary>
    public IProtocolPlugin? Get(ushort packetFormat) =>
        _byFormat.GetValueOrDefault(packetFormat);

    /// <summary>
    /// Best-effort lookup for the History viewer: returns the requested format if available,
    /// otherwise the closest older format (e.g. opening a 2026 log when only 2025 is registered).
    /// Never returns <c>null</c> when at least one plugin is registered.
    /// </summary>
    public IProtocolPlugin? GetOrFallback(ushort packetFormat)
    {
        if (_byFormat.TryGetValue(packetFormat, out var exact))
            return exact;

        IProtocolPlugin? best = null;
        foreach (var p in _ordered)
        {
            if (p.PacketFormat <= packetFormat) { best = p; break; }
        }
        return best ?? _ordered.FirstOrDefault();
    }

    /// <summary>All registered plugins, newest format first.</summary>
    public IReadOnlyList<IProtocolPlugin> All => _ordered;

    /// <summary>Default plugin used when no format is known yet (highest packet format).</summary>
    public IProtocolPlugin? Default => _ordered.Count > 0 ? _ordered[0] : null;
}
