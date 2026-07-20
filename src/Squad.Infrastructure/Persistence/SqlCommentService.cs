// ===========================================================================
//  SqlCommentService.cs  —  ICommentService over SQL Server (Dapper).
//  Activity comment thread: read history + post. Comments are enriched with the
//  author's display fields (joined from dbo.Athlete) so the client renders them
//  directly. Squad-scoped: only activities in the caller's squad are reachable.
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

public sealed class SqlCommentService(string connectionString) : ICommentService
{
    private const string SelectEnriched = """
        SELECT c.Id, c.ActivityId, c.AthleteId,
               a.DisplayName AS AthleteName, a.Initials, a.AvatarColor,
               c.Body, c.CreatedUtc,
               CASE WHEN a.AvatarBlob IS NOT NULL
                    THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), c.AthleteId)) END AS AvatarUrl
        FROM dbo.ActivityComment c
        JOIN dbo.Athlete a ON a.Id = c.AthleteId
        """;

    public async Task<IReadOnlyList<ActivityComment>?> GetAsync(Guid activityId, Guid squadId, int take, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        if (!await VisibleAsync(conn, activityId, squadId, ct)) return null;

        var top = Math.Clamp(take, 1, 200);
        // Newest `top` then flip to chronological so the client appends naturally.
        var sql = $"""
            SELECT * FROM (
                {SelectEnriched.Replace("SELECT c.Id", $"SELECT TOP {top} c.Id")}
                WHERE c.ActivityId = @activityId
                ORDER BY c.CreatedUtc DESC
            ) recent
            ORDER BY recent.CreatedUtc ASC;
            """;
        var rows = await conn.QueryAsync<ActivityComment>(
            new CommandDefinition(sql, new { activityId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<ActivityComment?> PostAsync(Guid activityId, Guid squadId, Guid athleteId, string body, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        if (!await VisibleAsync(conn, activityId, squadId, ct)) return null;

        var id = Guid.NewGuid();
        const string insert = """
            INSERT INTO dbo.ActivityComment (Id, ActivityId, AthleteId, Body)
            VALUES (@id, @activityId, @athleteId, @body);
            """;
        await conn.ExecuteAsync(new CommandDefinition(insert, new { id, activityId, athleteId, body }, cancellationToken: ct));

        return await conn.QuerySingleOrDefaultAsync<ActivityComment>(new CommandDefinition(
            SelectEnriched + " WHERE c.Id = @id;", new { id }, cancellationToken: ct));
    }

    // The activity must belong to a member of the caller's squad to be reachable.
    private static async Task<bool> VisibleAsync(SqlConnection conn, Guid activityId, Guid squadId, CancellationToken ct)
    {
        const string sql = """
            SELECT 1 FROM dbo.Activity a
              JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
             WHERE a.Id = @activityId AND ath.SquadId = @squadId;
            """;
        return await conn.ExecuteScalarAsync<int?>(
            new CommandDefinition(sql, new { activityId, squadId }, cancellationToken: ct)) is not null;
    }
}
