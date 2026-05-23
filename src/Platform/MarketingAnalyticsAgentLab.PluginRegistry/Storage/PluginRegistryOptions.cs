namespace MarketingAnalyticsAgentLab.PluginRegistry.Storage;

/// <summary>
/// Where the registry persists its JSON files. Mounted by Aspire to a shared <c>data/</c> folder
/// so the Python DevUI can pick up agent definitions from the same directory.
/// </summary>
public sealed class PluginRegistryOptions
{
    public const string SectionName = "PluginRegistry";

    /// <summary>Root directory for all registry files. Defaults to a sibling <c>data/</c> folder.</summary>
    public string DataDirectory { get; set; } = "../../data";

    public string ApiSpecsFolder => "api-specs";
    public string PluginsFolder => "plugins";
    public string AgentsFolder => "agent-definitions";
    public string AssistantsFolder => "assistants";
}
