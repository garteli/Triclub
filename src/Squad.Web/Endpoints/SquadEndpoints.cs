using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Squads / groups: discover, view, create, join. Joining (or creating) makes the
/// squad the athlete's active squad, so the feed / leaderboard / activities follow.
/// (Approval + payment gating is a deferred follow-up — join is immediate for now.)
/// </summary>
public static class SquadEndpoints
{
    public static IEndpointRouteBuilder MapSquads(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/squads").RequireAuthorization();
        g.MapGet("", List);
        g.MapGet("/{id:guid}", Get);
        g.MapPost("", Create);
        g.MapPost("/{id:guid}/join", Join);
        g.MapPost("/{id:guid}/requests/{athleteId:guid}/approve", Approve);
        g.MapPost("/{id:guid}/requests/{athleteId:guid}/decline", Decline);
        // The owner's cross-squad pending-request inbox.
        app.MapGet("/api/requests", Requests).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> List(HttpContext http, ISquadService squads, CancellationToken ct)
    {
        var me = Me(http);
        return Results.Ok(await squads.ListAsync(me, ct));
    }

    private static async Task<IResult> Get(Guid id, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        var s = await squads.GetAsync(id, Me(http), ct);
        return s is null ? Results.NotFound() : Results.Ok(s);
    }

    private static async Task<IResult> Create(SquadCreate body, HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Name) || string.IsNullOrWhiteSpace(body.Discipline))
            return Results.BadRequest(new { error = "Name and discipline are required." });

        var id = await squads.CreateAsync(body, me, ct);
        var created = await squads.GetAsync(id, me, ct);
        return Results.Created($"/api/squads/{id}", created);
    }

    private static async Task<IResult> Join(
        Guid id, HttpContext http, ISquadService squads,
        IAthleteDirectory directory, INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var squad = await squads.GetAsync(id, me, ct);
        if (squad is null) return Results.NotFound();

        var outcome = await squads.JoinOrRequestAsync(id, squad.Kind, me, ct);

        // Notify the owner: a genuinely-new free-squad member, or a new pending request.
        if (squad.OwnerId is { } owner && owner != me &&
            outcome is JoinOutcome.Joined or JoinOutcome.Requested)
        {
            var actor = await directory.GetAsync(me, ct);
            if (actor is not null)
                await notes.AddAsync(owner, outcome == JoinOutcome.Joined ? "join" : "request", me, actor.Name,
                    outcome == JoinOutcome.Joined ? $"joined {squad.Name}" : $"asked to join {squad.Name}", ct);
        }

        return Results.Ok(new { outcome = outcome.ToString().ToLowerInvariant(), squad = await squads.GetAsync(id, me, ct) });
    }

    private static async Task<IResult> Requests(HttpContext http, ISquadService squads, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return Results.Ok(await squads.GetPendingRequestsForOwnerAsync(me, ct));
    }

    private static async Task<IResult> Approve(
        Guid id, Guid athleteId, HttpContext http, ISquadService squads,
        INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var name = await squads.ApproveRequestAsync(id, athleteId, me, ct);
        if (name is null) return Results.NotFound(new { error = "No pending request, or you don't own this squad." });

        var squad = await squads.GetAsync(id, me, ct);
        await notes.AddAsync(athleteId, "approved", me, squad?.Name ?? "A squad", $"approved you to join {squad?.Name}", ct);
        return Results.Ok(new { status = "approved" });
    }

    private static async Task<IResult> Decline(
        Guid id, Guid athleteId, HttpContext http, ISquadService squads,
        INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var name = await squads.DeclineRequestAsync(id, athleteId, me, ct);
        if (name is null) return Results.NotFound(new { error = "No pending request, or you don't own this squad." });

        var squad = await squads.GetAsync(id, me, ct);
        await notes.AddAsync(athleteId, "declined", me, squad?.Name ?? "A squad", $"declined your request to join {squad?.Name}", ct);
        return Results.Ok(new { status = "declined" });
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
