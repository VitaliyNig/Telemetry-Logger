using System.Text.Json;
using F1Telemetry.Host.Serialization;
using Xunit;

namespace F1Telemetry.Tests;

/// <summary>
/// NaN/Infinity from UDP payloads must serialize as null (strict JSON), and null must
/// deserialize back to 0 — otherwise SignalR aborts the connection mid-session.
/// </summary>
public sealed class FiniteJsonConverterTests
{
    private static readonly JsonSerializerOptions Options = new()
    {
        Converters = { new FiniteSingleJsonConverter(), new FiniteDoubleJsonConverter() },
    };

    [Theory]
    [InlineData(float.NaN)]
    [InlineData(float.PositiveInfinity)]
    [InlineData(float.NegativeInfinity)]
    public void Float_NonFinite_WritesNull(float value)
    {
        Assert.Equal("null", JsonSerializer.Serialize(value, Options));
    }

    [Fact]
    public void Float_Finite_RoundTrips()
    {
        Assert.Equal("1.5", JsonSerializer.Serialize(1.5f, Options));
        Assert.Equal(1.5f, JsonSerializer.Deserialize<float>("1.5", Options));
    }

    [Fact]
    public void Float_Null_ReadsAsZero()
    {
        Assert.Equal(0f, JsonSerializer.Deserialize<float>("null", Options));
    }

    [Theory]
    [InlineData(double.NaN)]
    [InlineData(double.PositiveInfinity)]
    public void Double_NonFinite_WritesNull(double value)
    {
        Assert.Equal("null", JsonSerializer.Serialize(value, Options));
    }

    [Fact]
    public void Double_Null_ReadsAsZero()
    {
        Assert.Equal(0d, JsonSerializer.Deserialize<double>("null", Options));
    }
}
