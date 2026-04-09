using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace F1Telemetry.Telemetry;

/// <summary>
/// Writes ulong as a JSON string so JavaScript clients keep full precision (Number is IEEE-754).
/// </summary>
public sealed class ULongJsonStringConverter : JsonConverter<ulong>
{
    public override ulong Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        return reader.TokenType switch
        {
            JsonTokenType.String => ulong.Parse(reader.GetString()!, CultureInfo.InvariantCulture),
            JsonTokenType.Number => reader.TryGetUInt64(out var u) ? u : unchecked((ulong)reader.GetInt64()),
            _ => throw new JsonException($"Unexpected token {reader.TokenType} for ulong."),
        };
    }

    public override void Write(Utf8JsonWriter writer, ulong value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToString(CultureInfo.InvariantCulture));
}
