using System.IO;
using System.IO.Compression;
using System.Text.Json;
using F1Telemetry.Host.Serialization;

namespace F1Telemetry.Host.Logging;

/// <summary>
/// The "{slug}.samples" sidecar that holds per-lap sample/motion blobs for schema-v3 session
/// logs (see docs/SESSION_LOG_V3.md). The file is a sequence of length-prefixed frames:
/// <c>[len: int32 LE][gzip member of len bytes]</c>, each member decompressing to one
/// <see cref="LapBlob"/>. Append-only; flashback rewrites just append a new frame and
/// re-point the lap's <see cref="SampleRef"/>, leaving the old frame as dead bytes.
/// </summary>
public static class SampleSidecar
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>One frame's payload. Self-describing so repair/migration tools can rebuild refs by scanning.</summary>
    public sealed class LapBlob
    {
        public int CarIdx { get; set; }
        public byte LapNum { get; set; }
        public List<LapSample>? Samples { get; set; }
        public List<MotionSample>? Motion { get; set; }
    }

    /// <summary>Sidecar path next to the session's main JSON ("race.json" → "race.samples").</summary>
    public static string PathFor(string mainJsonPath) =>
        Path.ChangeExtension(mainJsonPath, ".samples");

    /// <summary>Appends one frame and returns its reference. Caller is the single writer.</summary>
    public static SampleRef Append(string sidecarPath, LapBlob blob)
    {
        byte[] gz;
        using (var ms = new MemoryStream())
        {
            using (var gzip = new GZipStream(ms, CompressionLevel.Fastest, leaveOpen: true))
                JsonSerializer.Serialize(gzip, blob, JsonOptions);
            gz = ms.ToArray();
        }

        using var fs = new FileStream(sidecarPath, FileMode.Append, FileAccess.Write, FileShare.Read);
        var offset = fs.Position;
        Span<byte> prefix = stackalloc byte[4];
        BitConverter.TryWriteBytes(prefix, gz.Length);
        fs.Write(prefix);
        fs.Write(gz);
        return new SampleRef { O = offset, L = gz.Length };
    }

    /// <summary>
    /// Reads the frame at <paramref name="sref"/>. Returns null on any inconsistency (missing
    /// file, out-of-range ref, corrupt gzip/JSON) — callers treat that as "no samples".
    /// </summary>
    public static LapBlob? ReadAt(string sidecarPath, SampleRef sref)
    {
        try
        {
            using var fs = new FileStream(sidecarPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            if (sref.O < 0 || sref.L <= 0 || sref.O + 4 + sref.L > fs.Length) return null;

            fs.Position = sref.O;
            Span<byte> prefix = stackalloc byte[4];
            fs.ReadExactly(prefix);
            if (BitConverter.ToInt32(prefix) != sref.L) return null; // ref does not point at a frame start

            var gz = new byte[sref.L];
            fs.ReadExactly(gz);
            using var gzip = new GZipStream(new MemoryStream(gz), CompressionMode.Decompress);
            return JsonSerializer.Deserialize<LapBlob>(gzip, JsonOptions);
        }
        catch (Exception ex) when (ex is IOException or InvalidDataException or JsonException)
        {
            return null;
        }
    }

    /// <summary>
    /// Sequentially enumerates all valid frames. Not used on the hot read path (refs give
    /// random access) — this exists for repair and v2→v3 migration tooling. Stops silently
    /// at the first truncated/corrupt frame.
    /// </summary>
    public static IEnumerable<(SampleRef Ref, LapBlob Blob)> Scan(string sidecarPath)
    {
        if (!File.Exists(sidecarPath)) yield break;
        using var fs = new FileStream(sidecarPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
        var prefix = new byte[4];
        while (fs.Position + 4 <= fs.Length)
        {
            var offset = fs.Position;
            fs.ReadExactly(prefix);
            var len = BitConverter.ToInt32(prefix);
            if (len <= 0 || fs.Position + len > fs.Length) yield break;

            var gz = new byte[len];
            fs.ReadExactly(gz);
            LapBlob? blob;
            try
            {
                using var gzip = new GZipStream(new MemoryStream(gz), CompressionMode.Decompress);
                blob = JsonSerializer.Deserialize<LapBlob>(gzip, JsonOptions);
            }
            catch (Exception ex) when (ex is InvalidDataException or JsonException)
            {
                yield break;
            }
            if (blob == null) yield break;
            yield return (new SampleRef { O = offset, L = len }, blob);
        }
    }
}
