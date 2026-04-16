namespace F1Telemetry.F125.Protocol;

/// <summary>Cached packet name strings indexed by <see cref="F125PacketId"/> byte value (avoids Enum.ToString allocation).</summary>
public static class F125PacketNames
{
    private static readonly string[] Names;

    static F125PacketNames()
    {
        var max = 0;
        foreach (var v in Enum.GetValues<F125PacketId>())
        {
            var b = (int)v;
            if (b > max) max = b;
        }

        Names = new string[max + 1];
        foreach (var v in Enum.GetValues<F125PacketId>())
            Names[(int)v] = v.ToString();
    }

    public static string Get(byte id) => id < Names.Length && Names[id] != null ? Names[id] : id.ToString();
}
