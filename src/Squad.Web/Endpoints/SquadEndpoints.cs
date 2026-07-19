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

        var wasMember = squad.IsMember;
        await squads.JoinAsync(id, me, ct);

        // Notify the squad owner of a genuinely new member (not a re-join, not self).
        if (!wasMember && squad.OwnerId is { } owner && owner != me)
        {
            var actor = await directory.GetAsync(me, ct);
            if (actor is not null)
                await notes.AddAsync(owner, "join", me, actor.Name, $"joined {squad.Name}", ct);
        }
        return Results.Ok(await squads.GetAsync(id, me, ct));
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
