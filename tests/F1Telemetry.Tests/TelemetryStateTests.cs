using F1Telemetry.State;
using Xunit;

namespace F1Telemetry.Tests;

public sealed class TelemetryStateTests
{
    [Fact]
    public void Update_OverwritesPreviousPacketOfSameId()
    {
        var state = new TelemetryState();
        state.Update(1, "first");
        state.Update(1, "second");

        Assert.Equal("second", state.Get(1));
    }

    [Fact]
    public void Get_Typed_ReturnsNullOnTypeMismatchOrMissing()
    {
        var state = new TelemetryState();
        state.Update(1, "a string");

        Assert.Null(state.Get<int[]>(1));
        Assert.Null(state.Get<string>(2));
        Assert.Equal("a string", state.Get<string>(1));
    }

    [Fact]
    public void Clear_EmptiesAllPackets()
    {
        var state = new TelemetryState();
        state.Update(1, "x");
        state.Update(2, "y");

        state.Clear();

        Assert.Empty(state.GetAll());
    }
}
