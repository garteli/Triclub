using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>Payload a coach posts to publish a plan (whole plan or a single week) onto athletes'
/// calendars. PlanId links the published rows back to the coach's saved plan (for unpublish/remove).</summary>
public sealed record PublishPlanRequest(
    Guid[]? AthleteIds, Guid? PlanId, string? PlanName, DateTime? StartDate, int? Weeks, PublishWorkoutDto[]? Workouts);

public sealed record PublishWorkoutDto(
    DateTime Date, string? Discipline, string? Title, string? Sub, int DurationMin, int Load);

/// <summary>Create/update a coach's saved plan. Id null = create.</summary>
public sealed record SavePlanRequest(Guid? Id, string? Name, string? Doc, Guid? SquadId);

/// <summary>Adopt a library template into the caller's plans, stamping their start/target date.</summary>
public sealed record AdoptTemplateRequest(string? AnchorType, string? AnchorDate);

/// <summary>
/// The signed-in athlete's weekly training plan (Mon..Sun of the current week,
/// or of the week containing an optional ?weekStart=yyyy-MM-dd).
/// Per-row status is derived from the date: past = done, today = today,
/// future = planned, rest days = rest. No plan assigned = empty week.
/// A coach can publish a plan (POST) onto their squad athletes' calendars.
/// </summary>
public static class PlanEndpoints
{
    private static readonly HashSet<string> AllowedDisciplines =
        new(StringComparer.OrdinalIgnoreCase) { "bike", "swim", "run", "gym", "rest" };

    public static IEndpointRouteBuilder MapPlan(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/plan", GetPlan).RequireAuthorization();
        app.MapPost("/api/plan/publish", PublishPlan).RequireAuthorization();
        // Coach pulls a published plan back off all athletes' calendars.
        app.MapPost("/api/plan/plans/{id:guid}/unpublish", UnpublishPlan).RequireAuthorization();
        // An athlete's own assigned plans + removing one from their calendar.
        app.MapGet("/api/plan/mine", ListMyPlans).RequireAuthorization();
        app.MapDelete("/api/plan/mine/{planId:guid}", RemoveMyPlan).RequireAuthorization();
        // A coach's own saved plans (they can have many).
        app.MapGet("/api/plan/plans", ListPlans).RequireAuthorization();
        app.MapGet("/api/plan/plans/{id:guid}", GetPlanDoc).RequireAuthorization();
        app.MapPost("/api/plan/plans", SavePlanDoc).RequireAuthorization();
        app.MapDelete("/api/plan/plans/{id:guid}", DeletePlanDoc).RequireAuthorization();
        // Plan library: browse pre-generated templates, load one, or adopt it as your own plan.
        app.MapGet("/api/plan/library", ListLibrary).RequireAuthorization();
        app.MapGet("/api/plan/library/{id:guid}", GetLibraryTemplate).RequireAuthorization();
        app.MapPost("/api/plan/library/{id:guid}/adopt", AdoptTemplate).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> ListLibrary(IPlanTemplateStore templates, CancellationToken ct)
    {
        var list = await templates.ListAsync(ct);
        return Results.Ok(list.Select(t => new
        {
            id = t.Id, distance = t.Distance, level = t.Level, goalLabel = t.GoalLabel,
            name = t.Name, weeks = t.Weeks, sortOrder = t.SortOrder,
        }));
    }

    private static async Task<IResult> GetLibraryTemplate(Guid id, IPlanTemplateStore templates, CancellationToken ct)
    {
        var t = await templates.GetAsync(id, ct);
        return t is null
            ? Results.NotFound(new { error = "Plan not found." })
            : Results.Ok(new { id = t.Id, distance = t.Distance, goalLabel = t.GoalLabel, name = t.Name, weeks = t.Weeks, doc = t.Doc });
    }

    /// <summary>Copy a library template into the caller's own plans, stamping their anchor date.
    /// Body: { anchorType?: "start"|"target", anchorDate?: "yyyy-MM-dd" }. → { id, name }.</summary>
    private static async Task<IResult> AdoptTemplate(
        HttpContext http, Guid id, AdoptTemplateRequest? req, IPlanTemplateStore templates, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } ownerId) return Results.Unauthorized();
        var t = await templates.GetAsync(id, ct);
        if (t is null) return Results.NotFound(new { error = "Plan not found." });

        var anchorType = string.Equals(req?.AnchorType, "target", StringComparison.OrdinalIgnoreCase) ? "target" : "start";
        var anchorDate = req?.AnchorDate;
        if (!string.IsNullOrWhiteSpace(anchorDate) && !DateOnly.TryParse(anchorDate,
                System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.None, out _))
            anchorDate = null;

        var doc = ApplyAnchor(t.Doc, anchorType, anchorDate);
        var newId = await plans.SavePlanAsync(ownerId, null, t.Name, doc, null, ct);
        return newId is null
            ? Results.Problem("Couldn't adopt that plan.")
            : Results.Ok(new { id = newId, name = t.Name });
    }

    // Stamp the chosen anchor onto the template's doc JSON so the adopted copy opens on the user's date.
    private static string ApplyAnchor(string doc, string anchorType, string? anchorDate)
    {
        try
        {
            var node = System.Text.Json.Nodes.JsonNode.Parse(doc);
            if (node is not null)
            {
                node["anchorType"] = anchorType;
                node["anchorDate"] = anchorDate ?? "";
                return node.ToJsonString();
            }
        }
        catch (System.Text.Json.JsonException) { /* fall through — save the doc as-is */ }
        return doc;
    }

    private static Guid? CallerId(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static async Task<IResult> ListPlans(HttpContext http, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } ownerId) return Results.Unauthorized();
        var list = await plans.ListPlansAsync(ownerId, ct);
        return Results.Ok(list.Select(p => new { id = p.Id, name = p.Name, updatedUtc = p.UpdatedUtc }));
    }

    private static async Task<IResult> GetPlanDoc(HttpContext http, Guid id, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } ownerId) return Results.Unauthorized();
        var plan = await plans.GetPlanAsync(ownerId, id, ct);
        return plan is null
            ? Results.NotFound(new { error = "Plan not found." })
            : Results.Ok(new { id = plan.Id, name = plan.Name, doc = plan.Doc, updatedUtc = plan.UpdatedUtc });
    }

    private static async Task<IResult> SavePlanDoc(HttpContext http, SavePlanRequest req, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } ownerId) return Results.Unauthorized();
        var name = (req.Name ?? "").Trim();
        if (name.Length == 0) name = "Untitled plan";
        if (name.Length > 120) name = name[..120];
        var doc = req.Doc ?? "";
        if (doc.Length == 0) return Results.BadRequest(new { error = "Nothing to save." });
        if (doc.Length > 400_000) return Results.BadRequest(new { error = "Plan is too large to save." });

        var id = await plans.SavePlanAsync(ownerId, req.Id, name, doc, req.SquadId, ct);
        return id is null
            ? Results.NotFound(new { error = "Plan not found." })
            : Results.Ok(new { id, name });
    }

    private static async Task<IResult> DeletePlanDoc(HttpContext http, Guid id, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } ownerId) return Results.Unauthorized();
        var ok = await plans.DeletePlanAsync(ownerId, id, ct);
        return ok ? Results.Ok(new { deleted = true }) : Results.NotFound(new { error = "Plan not found." });
    }

    private static async Task<IResult> PublishPlan(HttpContext http, PublishPlanRequest req, IPlanService plans, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var coachId)) return Results.Unauthorized();

        var athleteIds = (req.AthleteIds ?? Array.Empty<Guid>()).Where(g => g != Guid.Empty).Distinct().ToArray();
        if (athleteIds.Length == 0) return Results.BadRequest(new { error = "Assign at least one athlete." });

        var workouts = (req.Workouts ?? Array.Empty<PublishWorkoutDto>()).Select(MapWorkout).ToList();
        if (workouts.Count == 0) return Results.BadRequest(new { error = "Add at least one session before publishing." });

        // Clear the whole block span (so sessions removed since last publish vanish),
        // falling back to the min..max of the workout dates when no start/length is given.
        DateTime spanStart, spanEnd;
        if (req.StartDate is { } sd && req.Weeks is > 0)
        {
            spanStart = sd.Date;
            spanEnd = sd.Date.AddDays(req.Weeks.Value * 7 - 1);
        }
        else
        {
            spanStart = workouts.Min(w => w.Date);
            spanEnd = workouts.Max(w => w.Date);
        }

        // Stamp the source plan onto the rows so it can be unpublished/removed. The client sends the
        // saved plan's id; fall back to a fresh id if it was never saved (rows still group together).
        var planId = req.PlanId is { } pid && pid != Guid.Empty ? pid : Guid.NewGuid();
        var planName = (req.PlanName ?? "Training plan").Trim();
        if (planName.Length == 0) planName = "Training plan";
        if (planName.Length > 120) planName = planName[..120];

        var published = await plans.PublishAsync(coachId, planId, planName, athleteIds, spanStart, spanEnd, workouts, ct);
        if (published == 0) return Results.BadRequest(new { error = "None of the selected athletes are in a squad you coach." });
        return Results.Ok(new { published });
    }

    private static async Task<IResult> UnpublishPlan(HttpContext http, Guid id, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } coachId) return Results.Unauthorized();
        var removed = await plans.UnpublishAsync(coachId, id, ct);
        return Results.Ok(new { unpublished = removed });
    }

    private static async Task<IResult> ListMyPlans(HttpContext http, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } athleteId) return Results.Unauthorized();
        var list = await plans.ListAthletePlansAsync(athleteId, ct);
        return Results.Ok(list.Select(p => new
        {
            planId = p.PlanId,
            name = p.PlanName,
            firstDate = p.FirstDate.ToString("yyyy-MM-dd"),
            lastDate = p.LastDate.ToString("yyyy-MM-dd"),
            sessions = p.Sessions,
        }));
    }

    private static async Task<IResult> RemoveMyPlan(HttpContext http, Guid planId, IPlanService plans, CancellationToken ct)
    {
        if (CallerId(http) is not { } athleteId) return Results.Unauthorized();
        var removed = await plans.RemoveAthletePlanAsync(athleteId, planId, ct);
        return Results.Ok(new { removed });
    }

    private static PlannedWorkoutWrite MapWorkout(PublishWorkoutDto w)
    {
        var disc = AllowedDisciplines.Contains(w.Discipline ?? "") ? w.Discipline!.ToLowerInvariant() : "rest";
        var title = (w.Title ?? "").Trim();
        if (title.Length == 0) title = "Session";
        if (title.Length > 80) title = title[..80];
        var sub = string.IsNullOrWhiteSpace(w.Sub) ? null : (w.Sub!.Length > 120 ? w.Sub[..120] : w.Sub);
        return new PlannedWorkoutWrite(w.Date.Date, disc, title, sub,
            Math.Clamp(w.DurationMin, 0, 24 * 60), Math.Clamp(w.Load, 0, 100_000));
    }

    private static async Task<IResult> GetPlan(HttpContext http, IPlanService plans, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var athleteId)) return Results.Unauthorized();

        var today = DateTime.UtcNow.Date;

        // Optional ?weekStart=yyyy-MM-dd selects a different week (client date-nav); any day
        // in the target week is accepted and normalised to that week's Monday. Status stays
        // relative to the real today, so past weeks read "done" and future weeks "planned".
        var anchor = today;
        if (http.Request.Query.TryGetValue("weekStart", out var ws) &&
            DateOnly.TryParse(ws, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.None, out var parsed))
            anchor = parsed.ToDateTime(TimeOnly.MinValue);

        var monday = anchor.AddDays(-(((int)anchor.DayOfWeek + 6) % 7)); // Mon=0..Sun=6

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
