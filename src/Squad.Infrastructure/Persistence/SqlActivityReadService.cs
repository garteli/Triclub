// ===========================================================================
//  SqlActivityReadService.cs  —  IActivityReadService over SQL Server (Dapper).
//  Recent activities for a squad, joined to athlete display fields. Returns full
//  summary metrics so the client can render both the list card and the detail
//  view without a second round-trip. TINYINT Sport is CAST to int for Dapper's
//  strict record-constructor binding (byte→int isn't widened).
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

public sealed class SqlActivityReadService(string connectionString) : IActivityReadService
{
    public async Task<IReadOnlyList<ActivitySummaryRow>> GetForSquadAsync(Guid squadId, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 200);
        var sql = $"""
            SELECT TOP {top}
                   a.Id, a.AthleteId,
                   ath.DisplayName AS AthleteName, ath.Initials, ath.AvatarColor,
                   CAST(a.Sport AS int) AS Sport, a.StartUtc, a.MovingTimeSec, a.ElapsedTimeSec,
                   CAST(a.DistanceMeters AS float) AS DistanceMeters,
                   CAST(a.ElevationGainM AS float) AS ElevationGainM,
                   CAST(a.AvgHeartRate   AS float) AS AvgHeartRate,
                   CAST(a.AvgPowerWatts  AS float) AS AvgPowerWatts,
                   CAST(a.TrainingLoad   AS float) AS TrainingLoad,
                   CAST(a.Calories       AS float) AS Calories
            FROM dbo.Activity a
            JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
            WHERE ath.SquadId = @squadId
            ORDER BY a.StartUtc DESC;
            """;

        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<ActivitySummaryRow>(
            new CommandDefinition(sql, new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }
}
