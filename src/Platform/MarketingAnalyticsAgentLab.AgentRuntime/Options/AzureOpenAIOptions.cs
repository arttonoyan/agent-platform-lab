namespace MarketingAnalyticsAgentLab.AgentRuntime.Options;

/// <summary>
/// Binds the <c>AzureOpenAI</c> configuration section. The Aspire AppHost injects these via
/// environment variables (e.g. <c>AzureOpenAI__Endpoint</c>) from user-secrets.
/// </summary>
public sealed class AzureOpenAIOptions
{
    public const string SectionName = "AzureOpenAI";

    public string Endpoint { get; set; } = string.Empty;
    public string ApiKey { get; set; } = string.Empty;
    public string Deployment { get; set; } = "gpt-4o-mini";

    public bool HasEndpoint => !string.IsNullOrWhiteSpace(Endpoint);
    public bool HasApiKey => !string.IsNullOrWhiteSpace(ApiKey);
}
