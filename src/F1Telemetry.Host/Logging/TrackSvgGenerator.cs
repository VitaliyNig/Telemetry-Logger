using System.Globalization;
using System.IO;
using System.Text;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// First-run track contour generator. When the track-svg endpoint is asked for a trackId and no
/// hand-tuned SVG has been placed under wwwroot/assets/tracks/, we synthesize one from the
/// longest motion trace available in the session log. Result is cached to disk so subsequent
/// requests skip the generation cost.
/// </summary>
public static class TrackSvgGenerator
{
    private const int ViewBoxW = 1000;
    private const int ViewBoxH = 600;
    private const int TargetPoints = 300;
    private const int PaddingPct = 6;

    /// <summary>
    /// Picks the longest single-lap motion trace from the loaded session, normalizes X/Z into
    /// the fixed viewBox, simplifies with a stride for ~300 points, and returns the SVG source.
    /// </summary>
    public static string? TryGenerate(SessionLogDataV2 session)
    {
        if (session.Drivers == null) return null;

        List<MotionSample>? best = null;
        foreach (var driver in session.Drivers.Values)
        {
            foreach (var lap in driver.Laps)
            {
                if (lap.Motion == null || lap.Motion.Count < 50) continue;
                if (best == null || lap.Motion.Count > best.Count) best = lap.Motion;
            }
        }
        if (best == null) return null;

        var bounds = session.Meta?.TrackBoundsXZ;
        if (bounds == null) return null;

        var xRange = Math.Max(0.0001f, bounds.MaxX - bounds.MinX);
        var zRange = Math.Max(0.0001f, bounds.MaxZ - bounds.MinZ);
        var padX = ViewBoxW * PaddingPct / 100f;
        var padY = ViewBoxH * PaddingPct / 100f;
        var plotW = ViewBoxW - 2 * padX;
        var plotH = ViewBoxH - 2 * padY;
        var scale = Math.Min(plotW / xRange, plotH / zRange);
        var offX = padX + (plotW - xRange * scale) / 2f - bounds.MinX * scale;
        var offZ = padY + (plotH - zRange * scale) / 2f - bounds.MinZ * scale;

        var stride = Math.Max(1, best.Count / TargetPoints);
        var sb = new StringBuilder();
        sb.Append($"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {ViewBoxW} {ViewBoxH}\">");
        sb.Append("<path fill=\"none\" stroke=\"#2a2e3a\" stroke-width=\"8\" stroke-linejoin=\"round\" stroke-linecap=\"round\" d=\"");
        bool first = true;
        for (int i = 0; i < best.Count; i += stride)
        {
            var m = best[i];
            var px = (m.X * scale + offX).ToString("F1", CultureInfo.InvariantCulture);
            var py = (m.Z * scale + offZ).ToString("F1", CultureInfo.InvariantCulture);
            sb.Append(first ? $"M{px},{py}" : $" L{px},{py}");
            first = false;
        }
        // Close back to start for a continuous ring.
        sb.Append(" Z\"/></svg>");
        return sb.ToString();
    }

    /// <summary>Where a pre-rendered SVG for a given track lives (hand-tuned or auto-generated cache).</summary>
    public static string CachePath(string webRoot, int trackId)
    {
        return Path.Combine(webRoot, "assets", "tracks", $"{trackId}.svg");
    }
}
