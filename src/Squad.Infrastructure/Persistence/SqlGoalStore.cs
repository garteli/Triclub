// ===========================================================================
//  SqlGoalStore.cs  —  IGoalStore over SQL Server (Dapper).
//  One goal race per athlete (PK = AthleteId ⇒ upsert). See Sql/Goal.sql.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlGoalStore(string connectionString) : IGoalStore
{
    public async Task<AthleteGoal?> GetAsync(Guid athleteId, CancellationToken ct)
    {
        const string sql = """
            SELECT Name, RaceDate, Location, EventUrl
            FROM dbo.AthleteGoal WHERE AthleteId = @athleteId;
            """;
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<AthleteGoal>(
            new CommandDefinition(sql, new { athleteId }, cancellationToken: ct));
    }

    public async Task SetAsync(Guid athleteId, AthleteGoal goal, CancellationToken ct)
    {
        // Upsert: update the existing goal or insert the first one.
        const string sql = """
            IF EXISTS (SELECT 1 FROM dbo.AthleteGoal WHERE AthleteId = @athleteId)
                UPDATE dbo.AthleteGoal
                   SET Name = @Name, RaceDate = @RaceDate, Location = @Location,
                       EventUrl = @EventUrl, UpdatedUtc = SYSDATETIMEOFFSET()
                 WHERE AthleteId = @athleteId;
            ELSE
                INSERT INTO dbo.AthleteGoal (AthleteId, Name, RaceDate, Location, EventUrl)
                VALUES (@athleteId, @Name, @RaceDate, @Location, @EventUrl);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new
        {
            athleteId, goal.Name, goal.RaceDate, goal.Location, goal.EventUrl,
        }, cancellationToken: ct));
    }

    public async Task ClearAsync(Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.AthleteGoal WHERE AthleteId = @athleteId;",
            new { athleteId }, cancellationToken: ct));
    }
}
