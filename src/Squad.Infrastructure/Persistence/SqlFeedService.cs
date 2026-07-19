// ===========================================================================
//  SqlFeedService.cs  —  IFeedReadService over SQL Server (Dapper).
//  The initial feed load: the most recent committed activities for a squad,
//  joined to athlete display fields. The SquadHub tops this up live afterwards.
//  Numeric columns are read as nullable float to match FeedActivityRow.
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

public sealed class SqlFeedService(string connectionString) : IFeedReadService
{
    public async Task<IReadOnlyList<FeedActivityRow>> GetRecentAsync(Guid squadId, int take, CancellationToken ct)
    {
        // TOP is a literal (can't parameterize); clamp to a sane band.
        var top = Math.Clamp(take, 1, 200);
        var sql = $"""
            SELECT TOP {top}
                   a.Id, a.AthleteId,
                   ath.DisplayName AS AthleteName, ath.Initials, ath.AvatarColor,
                   CAST(a.Sport AS int) AS Sport, a.StartUtc, a.MovingTimeSec,
                   CAST(a.DistanceMeters AS float) AS DistanceMeters,
                   CAST(a.TrainingLoad  AS float) AS TrainingLoad,
                   CAST(a.AvgHeartRate  AS float) AS AvgHeartRate
            FROM dbo.Activity a
            JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
            WHERE ath.SquadId = @squadId
            ORDER BY a.StartUtc DESC;
            """;

        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<FeedActivityRow>(
            new CommandDefinition(sql, new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }
}
