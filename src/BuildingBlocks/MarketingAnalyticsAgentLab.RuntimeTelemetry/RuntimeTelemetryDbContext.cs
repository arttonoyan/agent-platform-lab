using MarketingAnalyticsAgentLab.RuntimeTelemetry.Models;
using Microsoft.EntityFrameworkCore;

namespace MarketingAnalyticsAgentLab.RuntimeTelemetry;

/// <summary>
/// EF Core context for the AI runtime telemetry store. Owns two tables:
/// <c>execution_events</c> (one row per Gateway interaction) and
/// <c>execution_tool_calls</c> (one row per tool invocation, parented by execution_id).
/// </summary>
public sealed class RuntimeTelemetryDbContext(DbContextOptions<RuntimeTelemetryDbContext> options)
    : DbContext(options)
{
    public DbSet<ExecutionEventRow> Executions => Set<ExecutionEventRow>();
    public DbSet<ToolCallRow> ToolCalls => Set<ToolCallRow>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<ExecutionEventRow>(e =>
        {
            // Snake_case table mapping is already on the entity via [Table]/[Column]; this
            // section adds indexes that the dashboard's "filter by tenant / agent / status"
            // queries lean on.
            e.HasIndex(x => x.Timestamp).HasDatabaseName("ix_execution_events_timestamp");
            e.HasIndex(x => x.TenantId).HasDatabaseName("ix_execution_events_tenant_id");
            e.HasIndex(x => x.AgentId).HasDatabaseName("ix_execution_events_agent_id");
            e.HasIndex(x => x.Status).HasDatabaseName("ix_execution_events_status");

            e.Property(x => x.EstimatedCost).HasPrecision(12, 6);
        });

        modelBuilder.Entity<ToolCallRow>(e =>
        {
            e.HasOne(x => x.Execution)
                .WithMany(x => x.ToolCalls)
                .HasForeignKey(x => x.ExecutionId)
                .OnDelete(DeleteBehavior.Cascade);

            e.HasIndex(x => new { x.ExecutionId, x.Sequence })
                .HasDatabaseName("ix_execution_tool_calls_execution_sequence");

            e.HasIndex(x => x.ToolName).HasDatabaseName("ix_execution_tool_calls_tool_name");
        });
    }
}
