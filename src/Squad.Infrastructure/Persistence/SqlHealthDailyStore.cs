// IHealthDailyStore over SQL Server (Dapper). Upsert is a MERGE keyed on (AthleteId, Day)
// that COALESCEs each metric — an incoming NULL keeps the stored value, so partial and
// repeated syncs never clear a previously-recorded metric.
using Dapper;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlHealthDailyStore(string connectionString) : IHealthDailyStore
{
    public async Task UpsertAsync(HealthDailyRecord day, CancellationToken ct)
    {
        const string sql = """
            MERGE dbo.HealthDaily AS target
            USING (SELECT @AthleteId AS AthleteId, @Day AS Day) AS src
              ON target.AthleteId = src.AthleteId AND target.Day = src.Day
            WHEN MATCHED THEN UPDATE SET
                RestingHr       = COALESCE(@RestingHr,       target.RestingHr),
                HrvMs           = COALESCE(@HrvMs,           target.HrvMs),
                RespiratoryRate = COALESCE(@RespiratoryRate, target.RespiratoryRate),
                WeightKg        = COALESCE(@WeightKg,        target.WeightKg),
                Vo2Max          = COALESCE(@Vo2Max,          target.Vo2Max),
                SleepHours      = COALESCE(@SleepHours,      target.SleepHours),
                UpdatedUtc      = SYSDATETIMEOFFSET()
            WHEN NOT MATCHED THEN INSERT
                (AthleteId, Day, RestingHr, HrvMs, RespiratoryRate, WeightKg, Vo2Max, SleepHours, UpdatedUtc)
                VALUES
                (@AthleteId, @Day, @RestingHr, @HrvMs, @RespiratoryRate, @WeightKg, @Vo2Max, @SleepHours, SYSDATETIMEOFFSET());
            """;

        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new
        {
            day.AthleteId,
            Day = day.Day.ToDateTime(TimeOnly.MinValue),   // DateOnly -> DATE param
            day.RestingHr,
            day.HrvMs,
            day.RespiratoryRate,
            day.WeightKg,
            day.Vo2Max,
            day.SleepHours,
        }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<HealthDailyRecord>> GetRangeAsync(
        Guid athleteId, DateOnly from, DateOnly to, CancellationToken ct)
    {
        const string sql = """
            SELECT AthleteId, Day, RestingHr, HrvMs, RespiratoryRate, WeightKg, Vo2Max, SleepHours
            FROM dbo.HealthDaily
            WHERE AthleteId = @athleteId AND Day BETWEEN @from AND @to
            ORDER BY Day DESC;
            """;

        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<Row>(new CommandDefinition(sql, new
        {
            athleteId,
            from = from.ToDateTime(TimeOnly.MinValue),
            to = to.ToDateTime(TimeOnly.MinValue),
        }, cancellationToken: ct));

        var list = new List<HealthDailyRecord>();
        foreach (var r in rows)
            list.Add(new HealthDailyRecord(
                r.AthleteId, DateOnly.FromDateTime(r.Day),
                r.RestingHr, r.HrvMs, r.RespiratoryRate, r.WeightKg, r.Vo2Max, r.SleepHours));
        return list;
    }

    private sealed record Row(
        Guid AthleteId, DateTime Day,
        double? RestingHr, double? HrvMs, double? RespiratoryRate,
        double? WeightKg, double? Vo2Max, double? SleepHours);
}
