using System.IO;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Resolves where the app reads History sessions from and writes new sessions to.
///
/// Two distinct knobs:
///   * <see cref="PersistentDefault"/> — the persisted "where my logs live" path (Settings tab).
///     Used for writing new sessions and is the baseline the History tab resets to.
///     Defaults to <see cref="BuiltInDefault"/> ("Logs" under the app base directory) when
///     the user hasn't set anything.
///   * <see cref="Path"/> — the current read root. Equals <see cref="PersistentDefault"/>
///     at startup; the History toolbar's "Select Folder" can flip it to an arbitrary path
///     for the lifetime of the process (ephemeral peek, never persisted).
///
/// Concurrent reads/writes are fine — string assignment is atomic for .NET reference types.
/// </summary>
public static class HistoryRoot
{
    public static string BuiltInDefault { get; } =
        System.IO.Path.Combine(AppContext.BaseDirectory, "Logs");

    private static string _persistentDefault = BuiltInDefault;
    private static string _path = BuiltInDefault;

    /// <summary>The persisted root (Settings tab). Always used for writing new sessions.</summary>
    public static string PersistentDefault
    {
        get => _persistentDefault;
        set
        {
            var resolved = string.IsNullOrWhiteSpace(value) ? BuiltInDefault : value;
            _persistentDefault = resolved;
            // Drop any in-flight ephemeral override so the new persisted choice takes effect now.
            _path = resolved;
        }
    }

    /// <summary>
    /// The current read root. Defaults to <see cref="PersistentDefault"/>; the History tab can
    /// override it for the session via <see cref="OverrideForSession"/>.
    /// </summary>
    public static string Path => _path;

    /// <summary>Sets a process-local read override (History tab). Pass null to revert to the persisted default.</summary>
    public static void OverrideForSession(string? path)
    {
        _path = string.IsNullOrWhiteSpace(path) ? _persistentDefault : path;
    }

    /// <summary>True when the current read root equals the persisted default (no ephemeral override active).</summary>
    public static bool IsDefault => string.Equals(
        System.IO.Path.GetFullPath(_path),
        System.IO.Path.GetFullPath(_persistentDefault),
        StringComparison.OrdinalIgnoreCase);

    /// <summary>True when the persisted default equals the built-in <c>Logs/</c> folder.</summary>
    public static bool PersistentIsBuiltIn => string.Equals(
        System.IO.Path.GetFullPath(_persistentDefault),
        System.IO.Path.GetFullPath(BuiltInDefault),
        StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves a configured path string (absolute or relative to base dir) to an absolute path.
    /// Empty/null => the built-in default.
    /// </summary>
    public static string Resolve(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured)) return BuiltInDefault;
        return System.IO.Path.IsPathRooted(configured)
            ? configured
            : System.IO.Path.Combine(AppContext.BaseDirectory, configured);
    }
}

