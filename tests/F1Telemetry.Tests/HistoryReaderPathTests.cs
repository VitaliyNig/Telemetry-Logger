using System.IO;
using F1Telemetry.Host.Logging;
using Xunit;

namespace F1Telemetry.Tests;

/// <summary>
/// Traversal safety for the {folder}/{slug} route parameters that reach the file system.
/// These tests mutate the process-wide HistoryRoot override, so they run in one collection
/// and restore it afterwards.
/// </summary>
[Collection("HistoryRoot")]
public sealed class HistoryReaderPathTests : IDisposable
{
    private readonly string _base;
    private readonly string _root;

    public HistoryReaderPathTests()
    {
        _base = Path.Combine(Path.GetTempPath(), "f1t-tests-" + Guid.NewGuid().ToString("N"));
        _root = Path.Combine(_base, "history");
        Directory.CreateDirectory(Path.Combine(_root, "weekend"));
        File.WriteAllText(Path.Combine(_root, "weekend", "race.json"), "{\"meta\":{}}");
        // Decoy one level ABOVE the history root: ResolvePath("..", "secret") used to resolve
        // to this file before SafeLeafName rejected dot-dot segments.
        File.WriteAllText(Path.Combine(_base, "secret.json"), "{}");
        HistoryRoot.OverrideForSession(_root);
    }

    public void Dispose()
    {
        HistoryRoot.OverrideForSession(null);
        try { Directory.Delete(_base, recursive: true); } catch { }
    }

    [Fact]
    public void ResolvePath_ReturnsFile_ForValidFolderAndSlug()
    {
        var path = HistoryReader.ResolvePath("weekend", "race");
        Assert.NotNull(path);
        Assert.EndsWith(Path.Combine("weekend", "race.json"), path);
    }

    [Fact]
    public void ResolvePath_ReturnsNull_WhenFileMissing()
    {
        Assert.Null(HistoryReader.ResolvePath("weekend", "nope"));
        Assert.Null(HistoryReader.ResolvePath("no-such-folder", "race"));
    }

    [Theory]
    [InlineData("..", "secret")]           // climb one level via dot-dot folder
    [InlineData(".", "secret")]
    [InlineData("weekend", "..")]
    [InlineData("", "race")]
    [InlineData("weekend", "")]
    [InlineData("week/end", "race")]       // separators must be rejected, not stripped
    [InlineData("week\\end", "race")]
    public void ResolvePath_RejectsTraversalShapes(string folder, string slug)
    {
        Assert.Null(HistoryReader.ResolvePath(folder, slug));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("a/b")]
    [InlineData("a\\b")]
    public void SafeLeafName_RejectsUnsafeNames(string? name)
    {
        Assert.Null(HistoryReader.SafeLeafName(name));
    }

    [Theory]
    [InlineData("weekend")]
    [InlineData("F125_Monza_2026-05-10_15-37")]
    [InlineData("..hidden")] // leading dots are fine as long as it's not exactly "." or ".."
    public void SafeLeafName_AcceptsPlainLeafNames(string name)
    {
        Assert.Equal(name, HistoryReader.SafeLeafName(name));
    }
}
