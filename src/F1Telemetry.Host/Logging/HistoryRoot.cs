using System.IO;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// Resolves the folder the History view reads sessions from.
/// Defaults to <c>Logs/</c> under the app base directory; users can point it at any other
/// folder via the History toolbar (Select Folder). The setting is global to the process —
/// concurrent reads/writes are fine because string assignment is atomic on .NET reference types.
/// New sessions continue to be written to <see cref="DefaultPath"/> regardless of override.
/// </summary>
public static class HistoryRoot
{
    public static string DefaultPath { get; } =
        Path.Combine(AppContext.BaseDirectory, "Logs");

    private static string _path = DefaultPath;

    public static string Path
    {
        get => _path;
        set => _path = string.IsNullOrWhiteSpace(value) ? DefaultPath : value;
    }

    public static bool IsDefault => string.Equals(
        System.IO.Path.GetFullPath(_path),
        System.IO.Path.GetFullPath(DefaultPath),
        StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Resolves a configured history folder string (absolute or relative to base dir) to
    /// an absolute path. Empty/null => default Logs folder.
    /// </summary>
    public static string Resolve(string? configured)
    {
        if (string.IsNullOrWhiteSpace(configured)) return DefaultPath;
        return System.IO.Path.IsPathRooted(configured)
            ? configured
            : System.IO.Path.Combine(AppContext.BaseDirectory, configured);
    }
}
