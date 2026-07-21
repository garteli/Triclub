// ===========================================================================
//  SqlProfileStatsService.cs  —  IProfileStatsService over SQL Server (Dapper).
//
//  Everything the Profile page shows that isn't identity or the goal race is
//  derived here from the athlete's real activities (plus follow counts). Nothing
//  is fabricated: an athlete with no rides gets zeros and empty lists, and the
//  client omits those sections rather than showing sample data.
//
//  Reads (all cheap, indexed by AthleteId — see IX_Activity_Athlete_Start):
//   1. scalar counts (following/followers/activities/year km)
//   2. trailing ~180d of lightweight activity rows → weekly volume, fitness
//      (CTL/ATL EWMA), this-block discipline totals, streak-based achievements
//   3. all-time per-sport maxima → personal bests
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlProfileStatsService(string connectionString) : IProfileStatsService
{
    // Sport TINYINT values (Squad.Core ActivitySport): 0 Other, 1 Swim, 2 Bike, 3 Run.
    private const int Swim = 1, Bike = 2, Run = 3;

    // EWMA time constants (days) — the endurance-standard CTL(42)/ATL(7).
    private const int CtlDays = 42, AtlDays = 7;

    // How much history to pull for the trend (warm-up) and how much to surface.
    private const int WindowDays = 180;   // pulled for EWMA warm-up + weekly buckets
    private const int TrendDays = 84;     // last 12 weeks plotted
    private const int VolumeWeeks = 10;   // weekly-volume bars
    private const int BlockWeeks = 12;    // "this block" discipline totals

    public async Task<ProfileStats> GetAsync(Guid athleteId, DateTimeOffset asOf, CancellationToken ct)
    {
        var since = asOf.AddDays(-WindowDays);
        var yearStart = new DateTimeOffset(new DateTime(asOf.UtcDateTime.Year, 1, 1), TimeSpan.Zero);

        await using var conn = new SqlConnection(connectionString);

        var scalars = await conn.QuerySingleAsync<ScalarRow>(new CommandDefinition(
            ScalarSql, new { athleteId, yearStart }, cancellationToken: ct));

        var rows = (await conn.QueryAsync<ActRow>(new CommandDefinition(
            TrailingSql, new { athleteId, since }, cancellationToken: ct))).ToList();

        var maxes = (await conn.QueryAsync<MaxRow>(new CommandDefinition(
            MaxSql, new { athleteId }, cancellationToken: ct))).ToList();

        var (weekVolumes, thisWk, priorWk) = WeeklyVolume(rows, asOf);
        var (fitness, ctl, atl) = FitnessTrend(rows, asOf);
        var disciplines = Disciplines(rows, asOf);
        var pbs = PersonalBests(maxes);
        var achievements = Achievements(scalars.ActivityCount, rows, asOf, weekVolumes);

        return new ProfileStats(
            Following: scalars.Following,
            Followers: scalars.Followers,
            ActivityCount: scalars.ActivityCount,
            YearDistanceKm: Math.Round(scalars.YearDistanceKm, 1),
            CtlNow: Math.Round(ctl, 0),
            AtlNow: Math.Round(atl, 0),
            Tsb: Math.Round(ctl - atl, 0),
            ThisWeekHours: Math.Round(thisWk, 1),
            WeekHoursDelta: Math.Round(thisWk - priorWk, 1),
            WeekVolumes: weekVolumes,
            Fitness: fitness,
            Disciplines: disciplines,
            PersonalBests: pbs,
            Achievements: achievements);
    }

    // ── weekly volume, split by discipline (last VolumeWeeks Monday weeks) ──
    private static (IReadOnlyList<WeekVolume>, double thisWk, double priorWk) WeeklyVolume(
        List<ActRow> rows, DateTimeOffset asOf)
    {
        var thisMonday = MondayOf(asOf.UtcDateTime.Date);
        var firstMonday = thisMonday.AddDays(-7 * (VolumeWeeks - 1));

        // week index (0..VolumeWeeks-1) → per-sport hours
        var buckets = new double[VolumeWeeks, 4]; // [week, sport slot] slot: 0 swim 1 bike 2 run 3 other
        foreach (var r in rows)
        {
            var monday = MondayOf(r.StartUtc.UtcDateTime.Date);
            var idx = (int)Math.Round((monday - firstMonday).TotalDays / 7.0);
            if (idx < 0 || idx >= VolumeWeeks) continue;
            buckets[idx, SportSlot(r.Sport)] += r.MovingTimeSec / 3600.0;
        }

        var list = new List<WeekVolume>(VolumeWeeks);
        for (int i = 0; i < VolumeWeeks; i++)
        {
            var monday = firstMonday.AddDays(7 * i);
            list.Add(new WeekVolume(
                monday.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                Math.Round(buckets[i, 0], 2), Math.Round(buckets[i, 1], 2),
                Math.Round(buckets[i, 2], 2), Math.Round(buckets[i, 3], 2)));
        }

        double Sum(int i) => i < 0 ? 0 : buckets[i, 0] + buckets[i, 1] + buckets[i, 2] + buckets[i, 3];
        return (list, Sum(VolumeWeeks - 1), Sum(VolumeWeeks - 2));
    }

    // ── fitness trend: daily CTL/ATL EWMA over the window, last TrendDays plotted ──
    private static (IReadOnlyList<FitnessPoint>, double ctl, double atl) FitnessTrend(
        List<ActRow> rows, DateTimeOffset asOf)
    {
        var today = asOf.UtcDateTime.Date;
        var start = today.AddDays(-(WindowDays - 1));

        var daily = new Dictionary<DateTime, double>();
        foreach (var r in rows)
        {
            var d = r.StartUtc.UtcDateTime.Date;
            if (d < start || d > today) continue;
            daily[d] = daily.GetValueOrDefault(d) + r.TrainingLoad;
        }

        var points = new List<FitnessPoint>(TrendDays);
        double ctl = 0, atl = 0;
        var plotFrom = today.AddDays(-(TrendDays - 1));
        for (var d = start; d <= today; d = d.AddDays(1))
        {
            var load = daily.GetValueOrDefault(d);
            ctl += (load - ctl) / CtlDays;
            atl += (load - atl) / AtlDays;
            if (d >= plotFrom)
                points.Add(new FitnessPoint(
                    d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                    Math.Round(ctl, 1), Math.Round(atl, 1)));
        }

        // No training load recorded at all ⇒ no meaningful trend to show.
        if (points.All(p => p.Ctl == 0 && p.Atl == 0))
            return (Array.Empty<FitnessPoint>(), 0, 0);

        return (points, ctl, atl);
    }

    // ── "this block · by discipline" — trailing BlockWeeks per-sport totals ──
    private static IReadOnlyList<DisciplineTotal> Disciplines(List<ActRow> rows, DateTimeOffset asOf)
    {
        var from = asOf.AddDays(-7 * BlockWeeks);
        var order = new[] { ("Bike", Bike), ("Run", Run), ("Swim", Swim), ("Other", 0) };

        var list = new List<DisciplineTotal>();
        foreach (var (label, sport) in order)
        {
            var these = rows.Where(r => r.StartUtc >= from && MatchSport(r.Sport, sport)).ToList();
            if (these.Count == 0) continue;
            list.Add(new DisciplineTotal(
                label,
                Math.Round(these.Sum(r => r.DistanceMeters) / 1000.0, 1),
                Math.Round(these.Sum(r => r.MovingTimeSec) / 3600.0, 1),
                these.Count));
        }
        return list;
    }

    // ── personal bests from all-time per-sport maxima ──
    private static IReadOnlyList<PersonalBest> PersonalBests(List<MaxRow> maxes)
    {
        var bySport = maxes.ToDictionary(m => m.Sport);
        var list = new List<PersonalBest>();

        if (bySport.TryGetValue(Bike, out var bike))
        {
            if (bike.MaxAvgPower > 0)
                list.Add(new PersonalBest("Best avg power", Math.Round(bike.MaxAvgPower).ToString("0", CultureInfo.InvariantCulture), "W", "Bike"));
            if (bike.MaxDistance > 0)
                list.Add(new PersonalBest("Longest ride", Km(bike.MaxDistance), "km", "Bike"));
        }
        if (bySport.TryGetValue(Run, out var run) && run.MaxDistance > 0)
            list.Add(new PersonalBest("Longest run", Km(run.MaxDistance), "km", "Run"));
        if (bySport.TryGetValue(Swim, out var swim) && swim.MaxDistance > 0)
        {
            if (swim.MaxDistance >= 1000)
                list.Add(new PersonalBest("Longest swim", Km(swim.MaxDistance), "km", "Swim"));
            else
                list.Add(new PersonalBest("Longest swim", Math.Round(swim.MaxDistance).ToString("0", CultureInfo.InvariantCulture), "m", "Swim"));
        }

        // Biggest single climb (bike or run), if we have elevation data.
        var maxElev = maxes.Where(m => m.Sport is Bike or Run).Select(m => (m.Sport, m.MaxElev))
            .OrderByDescending(x => x.MaxElev).FirstOrDefault();
        if (maxElev.MaxElev >= 300)
            list.Add(new PersonalBest("Biggest climb", Math.Round(maxElev.MaxElev).ToString("0", CultureInfo.InvariantCulture), "m", maxElev.Sport == Bike ? "Bike" : "Run"));

        return list.Take(4).ToList();
    }

    // ── achievements from real milestones ──
    private static IReadOnlyList<Achievement> Achievements(
        int activityCount, List<ActRow> rows, DateTimeOffset asOf, IReadOnlyList<WeekVolume> weeks)
    {
        var list = new List<Achievement>();

        // Activity-count milestone (highest reached).
        int[] tiers = { 1000, 500, 250, 100, 50, 25, 10 };
        var milestone = tiers.FirstOrDefault(t => activityCount >= t);
        if (milestone > 0)
            list.Add(new Achievement(milestone >= 1000 ? "Club legend" : "Consistent", milestone.ToString("N0", CultureInfo.InvariantCulture) + " activities", milestone.ToString(CultureInfo.InvariantCulture)));

        // Current streak (distinct training days up to today/yesterday).
        var streak = StreakDays(rows, asOf);
        if (streak >= 3)
            list.Add(new Achievement("On fire", "Day streak", streak.ToString(CultureInfo.InvariantCulture)));

        // Biggest week in the plotted window.
        var bigWeek = weeks.Select(w => w.SwimHours + w.BikeHours + w.RunHours + w.OtherHours)
            .DefaultIfEmpty(0).Max();
        if (bigWeek >= 8)
            list.Add(new Achievement("Big week", Math.Round(bigWeek).ToString("0", CultureInfo.InvariantCulture) + "h block", "⚡"));

        // A long endurance session (≥ 3h moving) — an event/finisher-grade effort.
        var longest = rows.Select(r => r.MovingTimeSec).DefaultIfEmpty(0).Max();
        if (longest >= 3 * 3600)
            list.Add(new Achievement("Endurance", (longest / 3600).ToString(CultureInfo.InvariantCulture) + "h+ session", "🏁"));

        return list;
    }

    // ── helpers ──
    private static int StreakDays(List<ActRow> rows, DateTimeOffset asOf)
    {
        var days = rows.Select(r => DateOnly.FromDateTime(r.StartUtc.UtcDateTime.Date)).ToHashSet();
        if (days.Count == 0) return 0;
        var today = DateOnly.FromDateTime(asOf.UtcDateTime.Date);
        var cursor = days.Contains(today) ? today : today.AddDays(-1);
        if (!days.Contains(cursor)) return 0;
        int n = 0;
        while (days.Contains(cursor)) { n++; cursor = cursor.AddDays(-1); }
        return n;
    }

    private static string Km(double meters)
    {
        var km = meters / 1000.0;
        return km >= 100
            ? Math.Round(km).ToString("0", CultureInfo.InvariantCulture)
            : Math.Round(km, 1).ToString("0.#", CultureInfo.InvariantCulture);
    }

    private static DateTime MondayOf(DateTime date)
    {
        int sinceMonday = ((int)date.DayOfWeek + 6) % 7; // Mon=0 … Sun=6
        return date.AddDays(-sinceMonday);
    }

    // slot: 0 swim, 1 bike, 2 run, 3 other (gym/other-sport)
    private static int SportSlot(int sport) => sport switch { Swim => 0, Bike => 1, Run => 2, _ => 3 };

    private static bool MatchSport(int sport, int target) =>
        target == 0 ? sport is not (Swim or Bike or Run) : sport == target;

    // ── SQL ──
    private const string ScalarSql = """
        SELECT
          (SELECT COUNT(*) FROM dbo.Follow WHERE FollowerId = @athleteId) AS Following,
          (SELECT COUNT(*) FROM dbo.Follow WHERE FolloweeId = @athleteId) AS Followers,
          (SELECT COUNT(*) FROM dbo.Activity WHERE AthleteId = @athleteId) AS ActivityCount,
          (SELECT CAST(ISNULL(SUM(DistanceMeters), 0) / 1000.0 AS float)
             FROM dbo.Activity WHERE AthleteId = @athleteId AND StartUtc >= @yearStart) AS YearDistanceKm;
        """;

    private const string TrailingSql = """
        SELECT CAST(a.Sport AS int) AS Sport, a.StartUtc, a.MovingTimeSec,
               CAST(ISNULL(a.DistanceMeters, 0) AS float) AS DistanceMeters,
               CAST(ISNULL(a.TrainingLoad, 0)  AS float) AS TrainingLoad
        FROM dbo.Activity a
        WHERE a.AthleteId = @athleteId AND a.StartUtc >= @since
        ORDER BY a.StartUtc;
        """;

    private const string MaxSql = """
        SELECT CAST(Sport AS int) AS Sport,
               CAST(ISNULL(MAX(DistanceMeters), 0) AS float)  AS MaxDistance,
               CAST(ISNULL(MAX(AvgPowerWatts), 0)  AS float)  AS MaxAvgPower,
               CAST(ISNULL(MAX(ElevationGainM), 0) AS float)  AS MaxElev
        FROM dbo.Activity WHERE AthleteId = @athleteId GROUP BY Sport;
        """;

    private sealed record ScalarRow(int Following, int Followers, int ActivityCount, double YearDistanceKm);
    private sealed record ActRow(int Sport, DateTimeOffset StartUtc, int MovingTimeSec, double DistanceMeters, double TrainingLoad);
    private sealed record MaxRow(int Sport, double MaxDistance, double MaxAvgPower, double MaxElev);
}
