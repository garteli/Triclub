// Daily wellness intake + read-back. Apple Health (iOS app) POSTs lightweight daily
// metrics — resting HR, HRV, respiratory rate, weight, VO2max, sleep — and the readiness
// UI reads them back. This is separate from the activity ingest: no fingerprint dedup,
// no feed fan-out. Upsert is idempotent + non-destructive (COALESCE per column).
using System.Globalization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Squad.Core;
using Squad.Infrastructure;

namespace Squad.Web;

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthDaily(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/health/daily", PostDaily).RequireAuthorization();
        app.MapGet("/api/health/daily", GetDaily).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> PostDaily(
        HealthDailyBatchDto batch, HttpContext http, IHealthDailyStore store, CancellationToken ct)
    {
        var athleteId = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (athleteId is null) return Results.Unauthorized();
        if (batch.Days.Count == 0) return Results.BadRequest("No days supplied.");

        int stored = 0, skipped = 0;
        foreach (var day in batch.Days)
        {
            if (!HealthDailyMapper.TryToRecord(day, athleteId.Value, out var record)) { skipped++; continue; }
            await store.UpsertAsync(record, ct);
            stored++;
        }

        return Results.Accepted("/api/health/daily", new { stored, skipped });
    }

    private static async Task<IResult> GetDaily(
        HttpContext http, IHealthDailyStore store, CancellationToken ct, int days = 90)
    {
        var athleteId = ActivityIntakeEndpoints.ResolveAthleteId(http.User);
        if (athleteId is null) return Results.Unauthorized();

        days = Math.Clamp(days, 1, 400);
        var to = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = to.AddDays(-(days - 1));

        var rows = await store.GetRangeAsync(athleteId.Value, from, to, ct);
        return Results.Ok(rows.Select(r => new
        {
            date = r.Day.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
            restingHr = r.RestingHr,
            hrvMs = r.HrvMs,
            respiratoryRate = r.RespiratoryRate,
            weightKg = r.WeightKg,
            vo2Max = r.Vo2Max,
            sleepHours = r.SleepHours,
        }));
    }
}
