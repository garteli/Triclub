// ===========================================================================
//  SqlLeaderboardService.cs
//  Computes the weekly board on the fly. For a squad of a handful of athletes the
//  indexed scan (IX_Activity_Athlete_Start INCLUDE Sport, TrainingLoad) is cheap —
//  no materialized table needed for the MVP. If a squad grows large or you want
//  cross-midnight-cheap history, snapshot these aggregates nightly instead.
//
//  Week bounds are computed in C# (Monday-based, UTC) and passed as parameters to
//  dodge SQL's DATEFIRST ambiguity. TODO: pass the squad's timezone so the week
//  boundary and streak day-bucketing land on the athletes' local midnight.
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

public sealed class SqlLeaderboardService(string connectionString) : ILeaderboardService
{
    public async Task<IReadOnlyList<LeaderboardRow>> GetWeeklyAsync(Guid squadId, Guid? me, DateTimeOffset asOf, CancellationToken ct)
    {
        var (thisFrom, thisTo) = WeekBounds(asOf);
        var priorFrom = thisFrom.AddDays(-7);
        var streakSince = asOf.AddDays(-60);

        await using var conn = new SqlConnection(connectionString);

        var roster = (await conn.QueryAsync<RosterRow>(new CommandDefinition(RosterSql,
            new { squadId }, cancellationToken: ct))).ToList();

        var thisWeek = (await Aggregate(conn, squadId, thisFrom, thisTo, ct)).ToDictionary(a => a.AthleteId);
        var priorWeek = (await Aggregate(conn, squadId, priorFrom, thisFrom, ct)).ToDictionary(a => a.AthleteId);

        var days = (await conn.QueryAsync<DayRow>(new CommandDefinition(DaysSql,
            new { squadId, since = streakSince }, cancellationToken: ct)))
            .GroupBy(d => d.AthleteId)
            .ToDictionary(g => g.Key, g => g.Select(x => DateOnly.FromDateTime(x.Dt)).ToHashSet());

        // Rank both weeks by Load (desc) so we can derive the move arrow.
        var thisRank = RankByLoad(thisWeek.Values);
        var priorRank = RankByLoad(priorWeek.Values);
        var today = DateOnly.FromDateTime(asOf.UtcDateTime);

        var rows = roster.Select(r =>
        {
            thisWeek.TryGetValue(r.Id, out var agg);
            int move = 0;
            if (thisRank.TryGetValue(r.Id, out var tr) && priorRank.TryGetValue(r.Id, out var pr))
                move = pr - tr; // climbed = positive

            return new LeaderboardRow
            {
                AthleteId = r.Id,
                Name = r.Name,
                Initials = r.Initials,
                Color = r.Color,
                You = me is not null && r.Id == me.Value,
                Load = agg?.Load ?? 0,
                VolumeHours = agg?.VolumeHours ?? 0,
                SwimLoad = agg?.SwimLoad ?? 0,
                BikeLoad = agg?.BikeLoad ?? 0,
                RunLoad = agg?.RunLoad ?? 0,
                Streak = days.TryGetValue(r.Id, out var set) ? Streak(set, today) : 0,
                Move = move,
            };
        })
        .OrderByDescending(r => r.Load) // default ordering; client re-sorts per tab
        .ToList();

        return rows;
    }

    private static async Task<IEnumerable<Agg>> Aggregate(SqlConnection conn, Guid squadId, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
        => await conn.QueryAsync<Agg>(new CommandDefinition(AggregateSql, new { squadId, from, to }, cancellationToken: ct));

    private static Dictionary<Guid, int> RankByLoad(IEnumerable<Agg> aggs)
        => aggs.OrderByDescending(a => a.Load)
               .Select((a, i) => (a.AthleteId, Rank: i + 1))
               .ToDictionary(x => x.AthleteId, x => x.Rank);

    private static int Streak(HashSet<DateOnly> days, DateOnly today)
    {
        if (days.Count == 0) return 0;
        // Don't penalize an athlete for not having trained yet *today*.
        var cursor = days.Contains(today) ? today : today.AddDays(-1);
        if (!days.Contains(cursor)) return 0;
        int n = 0;
        while (days.Contains(cursor)) { n++; cursor = cursor.AddDays(-1); }
        return n;
    }

    // Monday 00:00 UTC of asOf's week → +7 days.
    private static (DateTimeOffset from, DateTimeOffset to) WeekBounds(DateTimeOffset asOf)
    {
        var d = asOf.UtcDateTime.Date;
        int sinceMonday = ((int)d.DayOfWeek + 6) % 7; // Mon=0 … Sun=6
        var monday = d.AddDays(-sinceMonday);
        var from = new DateTimeOffset(monday, TimeSpan.Zero);
        return (from, from.AddDays(7));
    }

    private const string RosterSql = """
        SELECT Id, DisplayName AS Name, Initials, AvatarColor AS Color
        FROM dbo.Athlete WHERE SquadId = @squadId;
        """;

    // Every numeric column is CAST to float so it maps to the double-typed Agg
    // record parameters. Without the cast, `SUM(...) / 3600.0` returns SQL decimal,
    // which Dapper won't bind to a `double` constructor parameter (it rejects the
    // record's constructor and throws "a parameterless/single parameterized ctor is
    // required"). Keeping all six numeric columns float avoids that mismatch.
    private const string AggregateSql = """
        SELECT a.AthleteId,
               CAST(SUM(ISNULL(a.TrainingLoad, 0)) AS float)                     AS Load,
               CAST(SUM(a.MovingTimeSec) / 3600.0 AS float)                      AS VolumeHours,
               CAST(SUM(CASE WHEN a.Sport = 1 THEN ISNULL(a.TrainingLoad,0) ELSE 0 END) AS float) AS SwimLoad,
               CAST(SUM(CASE WHEN a.Sport = 2 THEN ISNULL(a.TrainingLoad,0) ELSE 0 END) AS float) AS BikeLoad,
               CAST(SUM(CASE WHEN a.Sport = 3 THEN ISNULL(a.TrainingLoad,0) ELSE 0 END) AS float) AS RunLoad
        FROM dbo.Activity a
        JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
        WHERE ath.SquadId = @squadId AND a.StartUtc >= @from AND a.StartUtc < @to
        GROUP BY a.AthleteId;
        """;

    private const string DaysSql = """
        SELECT DISTINCT a.AthleteId, CAST(a.StartUtc AS date) AS Dt
        FROM dbo.Activity a
        JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
        WHERE ath.SquadId = @squadId AND a.StartUtc >= @since;
        """;

    private sealed record RosterRow(Guid Id, string Name, string Initials, string Color);
    private sealed record Agg(Guid AthleteId, double Load, double VolumeHours, double SwimLoad, double BikeLoad, double RunLoad);
    private sealed record DayRow(Guid AthleteId, DateTime Dt);
}
