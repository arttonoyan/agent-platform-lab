using MarketingAnalyticsAgentLab.RuntimeTelemetry.Contracts;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Models;
using MarketingAnalyticsAgentLab.RuntimeTelemetry.Pricing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry;

/// <summary>
/// EF Core implementation of <see cref="IExecutionEventStore"/>. Writes happen in their
/// own scope/connection because the Gateway records telemetry from inside a request
/// pipeline that is racing the user response — we want telemetry persistence to never
/// hold up the HTTP reply.
/// </summary>
public sealed class EfExecutionEventStore(
    IServiceScopeFactory scopeFactory,
    ITokenPricing pricing,
    ILogger<EfExecutionEventStore> logger) : IExecutionEventStore
{
    public async Task RecordAsync(RecordExecutionRequest request, CancellationToken cancellationToken)
    {
        try
        {
            await using var scope = scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<RuntimeTelemetryDbContext>();

            var cost = pricing.EstimateUsd(request.Model, request.InputTokens, request.OutputTokens);

            var row = new ExecutionEventRow
            {
                ExecutionId = request.ExecutionId,
                Timestamp = request.Timestamp,
                TenantId = request.TenantId,
                UserId = request.UserId,
                Application = request.Application,
                AssistantId = request.AssistantId,
                AgentId = request.AgentId,
                Model = request.Model,
                InputTokens = request.InputTokens,
                OutputTokens = request.OutputTokens,
                EstimatedCost = cost,
                LatencyMs = request.LatencyMs,
                Status = request.Status,
                PermissionResult = request.PermissionResult,
                SensitiveFieldsFiltered = request.SensitiveFieldsFiltered,
                ApprovalRequired = request.ApprovalRequired,
                BlockedReason = request.BlockedReason,
                RouterReason = request.RouterReason,
                TraceId = request.TraceId,
                ToolCalls = request.ToolCalls.Select(tc => new ToolCallRow
                {
                    ExecutionId = request.ExecutionId,
                    Sequence = tc.Sequence,
                    ToolName = tc.ToolName,
                    PluginName = tc.PluginName,
                    SourceMethod = tc.SourceMethod,
                    SourcePath = tc.SourcePath,
                    LatencyMs = tc.LatencyMs,
                    Status = tc.Status,
                }).ToList(),
            };

            db.Executions.Add(row);
            await db.SaveChangesAsync(cancellationToken).ConfigureAwait(false);
        }
        catch (Exception ex)
        {
            // Telemetry must NEVER break the caller's request. Log and move on; the
            // dashboard will simply miss this row.
            logger.LogWarning(ex,
                "Failed to persist execution event {ExecutionId} for tenant {TenantId}.",
                request.ExecutionId, request.TenantId);
        }
    }

    public async Task<IReadOnlyList<ExecutionEventDto>> ListRecentAsync(int limit, CancellationToken cancellationToken)
    {
        if (limit <= 0) limit = 50;
        if (limit > 500) limit = 500;

        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<RuntimeTelemetryDbContext>();

        var rows = await db.Executions
            .AsNoTracking()
            .Include(e => e.ToolCalls)
            .OrderByDescending(e => e.Timestamp)
            .Take(limit)
            .ToListAsync(cancellationToken)
            .ConfigureAwait(false);

        return rows.Select(MapToDto).ToList();
    }

    public async Task<ExecutionEventDto?> GetAsync(string executionId, CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<RuntimeTelemetryDbContext>();

        var row = await db.Executions
            .AsNoTracking()
            .Include(e => e.ToolCalls)
            .FirstOrDefaultAsync(e => e.ExecutionId == executionId, cancellationToken)
            .ConfigureAwait(false);

        return row is null ? null : MapToDto(row);
    }

    private static ExecutionEventDto MapToDto(ExecutionEventRow row) => new(
        ExecutionId: row.ExecutionId,
        Timestamp: row.Timestamp,
        TenantId: row.TenantId,
        UserId: row.UserId,
        Application: row.Application,
        AssistantId: row.AssistantId,
        AgentId: row.AgentId,
        Model: row.Model,
        InputTokens: row.InputTokens,
        OutputTokens: row.OutputTokens,
        EstimatedCost: row.EstimatedCost,
        LatencyMs: row.LatencyMs,
        Status: row.Status,
        ToolCalls: row.ToolCalls
            .OrderBy(t => t.Sequence)
            .Select(t => new ExecutionToolCallDto(
                ToolName: t.ToolName,
                SourceMethod: t.SourceMethod,
                SourcePath: t.SourcePath,
                LatencyMs: t.LatencyMs,
                Status: t.Status))
            .ToList(),
        Policy: new PolicyResultDto(
            PermissionResult: row.PermissionResult,
            SensitiveFieldsFiltered: row.SensitiveFieldsFiltered,
            ApprovalRequired: row.ApprovalRequired,
            BlockedReason: row.BlockedReason),
        RouterReason: row.RouterReason,
        TraceId: row.TraceId);
}
