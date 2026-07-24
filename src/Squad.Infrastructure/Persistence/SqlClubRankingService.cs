// ===========================================================================
//  SqlClubRankingService.cs
//  The cross-club board: every club (a dbo.Squad with ≥1 member) ranked against
//  the others for the current week. Same on-the-fly aggregate as the per-squad
//  leaderboard, but grouped by the athlete's club (Athlete.SquadId) instead of by
//  athlete — so a handful of clubs stays a cheap indexed scan, no snapshot table.
//
//  Metrics: Load = ΣTSS of the club's members this week; VolumeHours = ΣMovingTime;
//  Members = roster size; Streak = the club's average member streak (whole days);
//  Move = load-rank change vs last week. Week bounds are Monday-based UTC (see
//  SqlLeaderboardService for the DATEFIRST rationale).
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

public sealed class SqlClubRankingService(string connectionString) : IClubRankingService
{
    // Decorative glyph shapes the client draws for each club logo. Picked
    // deterministically from the club id so a given club always shows the same one.
    private static readonly string[] Emblems = { "peak", "wave", "wheel", "bolt" };

    public async Task<IReadOnlyList<ClubRankingRow>> GetWeeklyAsync(Guid? me, DateTimeOffset asOf, CancellationToken ct)
    {
        var (thisFrom, thisTo) = WeekBounds(asOf);
        var priorFrom = thisFrom.AddDays(-7);
        var streakSince = asOf.AddDays(-60);

        await using var conn = new SqlConnection(connectionString);

        var clubs = (await conn.QueryAsync<ClubRow>(new CommandDefinition(ClubsSql,
            new { me = me ?? Guid.Empty, demoClub = Squads.ReviewDemoClub }, cancellationToken: ct))).ToList();

        var members = (await conn.QueryAsync<MemberCountRow>(new CommandDefinition(MembersSql, cancellationToken: ct)))
            .ToDictionary(m => m.SquadId, m => m.Members);

        var thisWeek = (await Aggregate(conn, thisFrom, thisTo, ct)).ToDictionary(a => a.SquadId);
        var priorWeek = (await Aggregate(conn, priorFrom, thisFrom, ct)).ToDictionary(a => a.SquadId);

        // Per-athlete active days → streak → averaged per club.
        var today = DateOnly.FromDateTime(asOf.UtcDateTime);
        var athleteDays = (await conn.QueryAsync<AthleteDayRow>(new CommandDefinition(DaysSql,
                new { since = streakSince }, cancellationToken: ct)))
            .GroupBy(d => (d.SquadId, d.AthleteId))
            .ToDictionary(g => g.Key, g => g.Select(x => DateOnly.FromDateTime(x.Dt)).ToHashSet());
        var clubStreaks = athleteDays
            .GroupBy(kv => kv.Key.SquadId)
            .ToDictionary(g => g.Key, g => (int)Math.Round(g.Average(kv => Streak(kv.Value, today))));

        // The caller's active club (the one whose feed/leaderboard they see) → the You flag.
        Guid? mySquad = me is null ? null : await conn.QuerySingleOrDefaultAsync<Guid?>(
            new CommandDefinition("SELECT SquadId FROM dbo.Athlete WHERE Id = @me;",
                new { me }, cancellationToken: ct));

        var thisRank = RankByLoad(thisWeek.Values);
        var priorRank = RankByLoad(priorWeek.Values);

        var rows = clubs.Select(c =>
        {
            thisWeek.TryGetValue(c.Id, out var agg);
            int move = 0;
            if (thisRank.TryGetValue(c.Id, out var tr) && priorRank.TryGetValue(c.Id, out var pr))
                move = pr - tr; // climbed = positive

            return new ClubRankingRow
            {
                SquadId = c.Id,
                Name = c.Name,
                Initials = Initials(c.Name),
                Color = c.Color,
                Discipline = c.Discipline ?? "",
                Emblem = Emblem(c.Id),
                You = mySquad is not null && c.Id == mySquad.Value,
                Load = agg?.Load ?? 0,
                VolumeHours = agg?.VolumeHours ?? 0,
                Members = members.TryGetValue(c.Id, out var mc) ? mc : 0,
                Streak = clubStreaks.TryGetValue(c.Id, out var st) ? st : 0,
                Move = move,
            };
        })
        .Where(r => r.Members > 0)      // a "club" on the board is a squad with a real roster
        .OrderByDescending(r => r.Load) // default ordering; client re-sorts per tab
        .ToList();

        return rows;
    }

    private static async Task<IEnumerable<Agg>> Aggregate(SqlConnection conn, DateTimeOffset from, DateTimeOffset to, CancellationToken ct)
        => await conn.QueryAsync<Agg>(new CommandDefinition(AggregateSql, new { from, to }, cancellationToken: ct));

    private static Dictionary<Guid, int> RankByLoad(IEnumerable<Agg> aggs)
        => aggs.OrderByDescending(a => a.Load)
               .Select((a, i) => (a.SquadId, Rank: i + 1))
               .ToDictionary(x => x.SquadId, x => x.Rank);

    private static int Streak(HashSet<DateOnly> days, DateOnly today)
    {
        if (days.Count == 0) return 0;
        // Don't penalize for not having trained yet *today*.
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

    // Stable per-club glyph: fold the id bytes so restarts pick the same emblem
    // (Guid.GetHashCode isn't guaranteed stable across runtimes).
    private static string Emblem(Guid id)
    {
        int h = 0;
        foreach (var b in id.ToByteArray()) h = (h * 31 + b) & 0x7fffffff;
        return Emblems[h % Emblems.Length];
    }

    private static string Initials(string name)
    {
        var parts = (name ?? "").Split(new[] { ' ', '-' }, StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "?";
        string first = parts[0][..1];
        string second = parts.Length > 1 ? parts[1][..1] : (parts[0].Length > 1 ? parts[0].Substring(1, 1) : "");
        return (first + second).ToUpperInvariant();
    }

    // The App Store review demo club is kept off the board for everyone except its own
    // members (the reviewer), so it can't be seen or joined from the public rankings.
    private const string ClubsSql = """
        SELECT s.Id, s.Name, s.Color, s.Discipline
        FROM dbo.Squad s
        WHERE s.Kind <> 'personal'
          AND (s.Name <> @demoClub OR EXISTS (
               SELECT 1 FROM dbo.Membership dm WHERE dm.SquadId = s.Id AND dm.AthleteId = @me));
        """;

    private const string MembersSql = """
        SELECT SquadId, COUNT(*) AS Members
        FROM dbo.Athlete
        WHERE SquadId IS NOT NULL
        GROUP BY SquadId;
        """;

    // Float-cast the numeric columns so Dapper binds them to the double-typed Agg
    // record (a SQL decimal would reject the record's ctor) — see SqlLeaderboardService.
    private const string AggregateSql = """
        SELECT ath.SquadId,
               CAST(SUM(ISNULL(a.TrainingLoad, 0)) AS float) AS Load,
               CAST(SUM(a.MovingTimeSec) / 3600.0 AS float)  AS VolumeHours
        FROM dbo.Activity a
        JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
        WHERE ath.SquadId IS NOT NULL AND a.StartUtc >= @from AND a.StartUtc < @to
        GROUP BY ath.SquadId;
        """;

    private const string DaysSql = """
        SELECT DISTINCT ath.SquadId, a.AthleteId, CAST(a.StartUtc AS date) AS Dt
        FROM dbo.Activity a
        JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
        WHERE ath.SquadId IS NOT NULL AND a.StartUtc >= @since;
        """;

    private sealed record ClubRow(Guid Id, string Name, string Color, string? Discipline);
    private sealed record MemberCountRow(Guid SquadId, int Members);
    private sealed record Agg(Guid SquadId, double Load, double VolumeHours);
    private sealed record AthleteDayRow(Guid SquadId, Guid AthleteId, DateTime Dt);
}
