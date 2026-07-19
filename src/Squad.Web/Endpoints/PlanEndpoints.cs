using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// The signed-in athlete's weekly training plan (Mon..Sun of the current week),
/// seeded on first view. Per-row status is derived from the date: past = done,
/// today = today, future = planned, rest days = rest.
/// </summary>
public static class PlanEndpoints
{
    public static IEndpointRouteBuilder MapPlan(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/plan", GetPlan).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetPlan(HttpContext http, IPlanService plans, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var athleteId)) return Results.Unauthorized();

        var today = DateTime.UtcNow.Date;
        var monday = today.AddDays(-(((int)today.DayOfWeek + 6) % 7)); // Mon=0..Sun=6

        var rows = await plans.GetWeekAsync(athleteId, monday, ct);

        var week = rows.Select(r =>
        {
            var status = r.Discipline == "rest" ? "rest"
                : r.WorkoutDate < today ? "done"
                : r.WorkoutDate == today ? "today"
                : "planned";
            return new
            {
                id = r.Id,
                date = r.WorkoutDate.ToString("yyyy-MM-dd"),
                discipline = r.Discipline,
                title = r.Title,
                sub = r.Sub,
                durationMin = r.DurationMin,
                load = r.Load,
                status,
            };
        }).ToList();

        var summary = new
        {
            plannedMin = rows.Sum(r => r.DurationMin),
            load = rows.Sum(r => r.Load),
            done = week.Count(w => w.status == "done"),
            total = week.Count(w => w.discipline != "rest"),
        };

        return Results.Ok(new { week, summary });
    }
}
