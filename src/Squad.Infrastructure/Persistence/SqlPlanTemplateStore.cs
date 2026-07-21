// ===========================================================================
//  SqlPlanTemplateStore.cs — IPlanTemplateStore over SQL Server (Dapper).
//  The pre-generated plan library: browse summaries, load one, upsert by
//  (distance, level) so the seeder can (re)generate idempotently.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlPlanTemplateStore(string connectionString) : IPlanTemplateStore
{
    public async Task<IReadOnlyList<PlanTemplateSummary>> ListAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<PlanTemplateSummary>(new CommandDefinition("""
            SELECT Id, Distance, Level, GoalLabel, Name, Weeks, SortOrder
            FROM dbo.PlanTemplate ORDER BY SortOrder;
            """, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<PlanTemplate?> GetAsync(Guid id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<PlanTemplate>(new CommandDefinition("""
            SELECT Id, Distance, Level, GoalLabel, Name, Weeks, SortOrder, Doc,
                   CAST(UpdatedUtc AS datetimeoffset(0)) AS UpdatedUtc
            FROM dbo.PlanTemplate WHERE Id = @id;
            """, new { id }, cancellationToken: ct));
    }

    public async Task<bool> ExistsAsync(string distance, string level, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.PlanTemplate WHERE Distance = @distance AND Level = @level;",
            new { distance, level }, cancellationToken: ct)) > 0;
    }

    public async Task UpsertAsync(PlanTemplate t, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.PlanTemplate
               SET GoalLabel = @GoalLabel, Name = @Name, Weeks = @Weeks, SortOrder = @SortOrder,
                   Doc = @Doc, UpdatedUtc = SYSDATETIMEOFFSET()
             WHERE Distance = @Distance AND Level = @Level;
            IF @@ROWCOUNT = 0
                INSERT INTO dbo.PlanTemplate (Id, Distance, Level, GoalLabel, Name, Weeks, SortOrder, Doc, UpdatedUtc)
                VALUES (@Id, @Distance, @Level, @GoalLabel, @Name, @Weeks, @SortOrder, @Doc, SYSDATETIMEOFFSET());
            """, new { t.Id, t.Distance, t.Level, t.GoalLabel, t.Name, t.Weeks, t.SortOrder, t.Doc }, cancellationToken: ct));
    }
}
