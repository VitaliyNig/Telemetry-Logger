using System.Buffers.Binary;
using System.Text;

namespace F1Telemetry.F125.Protocol;

/// <summary>
/// Stateful span-based binary reader for little-endian F1 25 packet data.
/// Tracks an offset and provides typed reads for all F1 data types.
/// </summary>
internal ref struct BinaryReader125
{
    private readonly ReadOnlySpan<byte> _data;
    private int _offset;

    public BinaryReader125(ReadOnlySpan<byte> data, int startOffset = 0)
    {
        _data = data;
        _offset = startOffset;
    }

    public int Offset => _offset;
    public int Remaining => _data.Length - _offset;

    public byte ReadByte() => _data[_offset++];

    public sbyte ReadSByte() => (sbyte)_data[_offset++];

    public ushort ReadUInt16()
    {
        var val = BinaryPrimitives.ReadUInt16LittleEndian(_data[_offset..]);
        _offset += 2;
        return val;
    }

    public short ReadInt16()
    {
        var val = BinaryPrimitives.ReadInt16LittleEndian(_data[_offset..]);
        _offset += 2;
        return val;
    }

    public uint ReadUInt32()
    {
        var val = BinaryPrimitives.ReadUInt32LittleEndian(_data[_offset..]);
        _offset += 4;
        return val;
    }

    public ulong ReadUInt64()
    {
        var val = BinaryPrimitives.ReadUInt64LittleEndian(_data[_offset..]);
        _offset += 8;
        return val;
    }

    public float ReadFloat()
    {
        var val = BinaryPrimitives.ReadSingleLittleEndian(_data[_offset..]);
        _offset += 4;
        return val;
    }

    public double ReadDouble()
    {
        var val = BinaryPrimitives.ReadDoubleLittleEndian(_data[_offset..]);
        _offset += 8;
        return val;
    }

    public string ReadString(int maxLength)
    {
        var slice = _data.Slice(_offset, maxLength);
        _offset += maxLength;
        var end = slice.IndexOf((byte)0);
        if (end >= 0)
            slice = slice[..end];
        return Encoding.UTF8.GetString(slice);
    }

    public float[] ReadFloatArray(int count)
    {
        var arr = new float[count];
        for (var i = 0; i < count; i++)
            arr[i] = ReadFloat();
        return arr;
    }

    public ushort[] ReadUInt16Array(int count)
    {
        var arr = new ushort[count];
        for (var i = 0; i < count; i++)
            arr[i] = ReadUInt16();
        return arr;
    }

    public byte[] ReadByteArray(int count)
    {
        var arr = new byte[count];
        for (var i = 0; i < count; i++)
            arr[i] = ReadByte();
        return arr;
    }

    public void Skip(int bytes) => _offset += bytes;
}
