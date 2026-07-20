// ===========================================================================
//  SqlKudosService.cs  —  IKudosService over SQL Server (Dapper).
//  Give/remove kudos on an activity, squad-scoped so an athlete can only react
//  to activities owned by a member of their own squad. Idempotent both ways.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlKudosService(string connectionString) : IKudosService
{
    public async Task<KudosState?> SetAsync(Guid activityId, Guid squadId, Guid athleteId, bool give, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);

        // Visibility gate: the activity must belong to a member of the caller's squad.
        const string visible = """
            SELECT 1 FROM dbo.Activity a
              JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
             WHERE a.Id = @activityId AND ath.SquadId = @squadId;
            """;
        var ok = await conn.ExecuteScalarAsync<int?>(
            new CommandDefinition(visible, new { activityId, squadId }, cancellationToken: ct));
        if (ok is null) return null;

        var sql = give
            ? """
              IF NOT EXISTS (SELECT 1 FROM dbo.ActivityKudos WHERE ActivityId = @activityId AND AthleteId = @athleteId)
                  INSERT INTO dbo.ActivityKudos (ActivityId, AthleteId) VALUES (@activityId, @athleteId);
              """
            : "DELETE FROM dbo.ActivityKudos WHERE ActivityId = @activityId AND AthleteId = @athleteId;";
        await conn.ExecuteAsync(new CommandDefinition(sql, new { activityId, athleteId }, cancellationToken: ct));

        var count = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(*) FROM dbo.ActivityKudos WHERE ActivityId = @activityId;",
            new { activityId }, cancellationToken: ct));
        return new KudosState(count, give);
    }
}
