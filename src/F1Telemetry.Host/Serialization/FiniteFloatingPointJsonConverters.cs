using System.Text.Json;
using System.Text.Json.Serialization;

namespace F1Telemetry.Host.Serialization;

/// <summary>
/// UDP payloads may contain NaN/Infinity floats; strict JSON cannot represent those values and
/// SignalR's JsonHubProtocol aborts the connection. Emit null so browser JSON.parse stays valid.
/// </summary>
public sealed class FiniteSingleJsonConverter : JsonConverter<float>
{
    public override float Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? 0f : reader.GetSingle();

    public override void Write(Utf8JsonWriter writer, float value, JsonSerializerOptions options)
    {
        if (float.IsFinite(value))
            writer.WriteNumberValue(value);
        else
            writer.WriteNullValue();
    }
}

public sealed class FiniteDoubleJsonConverter : JsonConverter<double>
{
    public override double Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.TokenType == JsonTokenType.Null ? 0d : reader.GetDouble();

    public override void Write(Utf8JsonWriter writer, double value, JsonSerializerOptions options)
    {
        if (double.IsFinite(value))
            writer.WriteNumberValue(value);
        else
            writer.WriteNullValue();
    }
}
