using System.Text.Json;
using System.Text.Json.Serialization;

namespace MarketingAnalyticsAgentLab.PluginRegistry.Storage;

internal static class JsonSerialization
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new JsonStringEnumConverter() },
    };
}
