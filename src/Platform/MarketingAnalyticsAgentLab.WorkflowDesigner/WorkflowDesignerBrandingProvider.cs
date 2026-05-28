using Elsa.Studio.Branding;

namespace MarketingAnalyticsAgentLab.WorkflowDesigner;

/// <summary>
/// Replaces the <see cref="DefaultBrandingProvider"/> registered by <c>AddCore()</c>.
///
/// Two reasons we override:
///   1. The default provider's <see cref="DefaultBrandingProvider.AppNameWithVersion"/>
///      reads from an internal <c>ToolVersion.GetDisplayVersion()</c> that is hardcoded
///      to "3.6" in the shipped Elsa Studio packages, even on 3.7.0 (the maintainers
///      didn't bump the string). The sidebar header then shows "Elsa Studio 3.6"
///      which is misleading.
///   2. Easy seam for future white-labelling — rename to "Workflow Designer", swap
///      logos, change the tagline. For the POC we keep the Elsa branding because
///      that's the engine the operator is actually using.
///
/// Registered in Program.cs via:
///   builder.Services.AddCore().Replace(new(
///       typeof(IBrandingProvider),
///       typeof(WorkflowDesignerBrandingProvider),
///       ServiceLifetime.Scoped));
/// </summary>
public sealed class WorkflowDesignerBrandingProvider : DefaultBrandingProvider
{
    // Keep the AppName so any internal Elsa code that uses it (e.g. browser tab title
    // bits, login page header) still reads naturally.
    public override string AppName => "Elsa Studio";

    // Pin the displayed version to the actual installed package version. Bump this
    // string when the ElsaVersion property in Directory.Packages.props moves.
    public override string AppNameWithVersion => $"{AppName} 3.7.0";
}
