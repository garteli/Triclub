using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Kudos + comments on an activity (the feed's social layer). Both are squad-scoped:
/// an athlete can only react to / comment on activities owned by a member of their
/// squad. Writes persist then fan out to the squad's feed group so open clients update
/// their counts / threads live (mirrors the chat REST-write + hub-fanout pattern).
/// </summary>
public static class InteractionEndpoints
{
    public static IEndpointRouteBuilder MapInteractions(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/activities/{id:guid}").RequireAuthorization();
        g.MapPost("/kudos", GiveKudos);
        g.MapDelete("/kudos", RemoveKudos);
        g.MapGet("/comments", GetComments);
        g.MapPost("/comments", PostComment);
        return app;
    }

    private static Task<IResult> GiveKudos(
        Guid id, HttpContext http, IAthleteDirectory dir, IKudosService kudos, IHubContext<SquadHub> hub, CancellationToken ct)
        => SetKudos(id, give: true, http, dir, kudos, hub, ct);

    private static Task<IResult> RemoveKudos(
        Guid id, HttpContext http, IAthleteDirectory dir, IKudosService kudos, IHubContext<SquadHub> hub, CancellationToken ct)
        => SetKudos(id, give: false, http, dir, kudos, hub, ct);

    private static async Task<IResult> SetKudos(
        Guid id, bool give, HttpContext http, IAthleteDirectory dir, IKudosService kudos, IHubContext<SquadHub> hub, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        var profile = await dir.GetAsync(me, ct);
        if (profile is null) return Results.Unauthorized();

        var state = await kudos.SetAsync(id, profile.SquadId, me, give, ct);
        if (state is null) return Results.NotFound();

        // Fan out the fresh count so other members' open feeds/cards update (they compute
        // their own IKudoed locally; only the total travels).
        await hub.Clients.Group(SquadHub.SquadGroup(profile.SquadId))
            .SendAsync("activityKudos", new { activityId = id, kudos = state.Count }, ct);
        return Results.Ok(state);
    }

    private static async Task<IResult> GetComments(
        Guid id, HttpContext http, IAthleteDirectory dir, ICommentService comments, CancellationToken ct, int take = 100)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        var profile = await dir.GetAsync(me, ct);
        if (profile is null) return Results.Unauthorized();

        var list = await comments.GetAsync(id, profile.SquadId, take, ct);
        return list is null ? Results.NotFound() : Results.Ok(list);
    }

    private static async Task<IResult> PostComment(
        Guid id, PostCommentRequest body, HttpContext http, IAthleteDirectory dir,
        ICommentService comments, IHubContext<SquadHub> hub, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        var text = body.Body?.Trim();
        if (string.IsNullOrEmpty(text)) return Results.BadRequest(new { error = "Comment body is required." });
        if (text.Length > 1000) return Results.BadRequest(new { error = "Comment too long (max 1000 chars)." });

        var profile = await dir.GetAsync(me, ct);
        if (profile is null) return Results.Unauthorized();

        var comment = await comments.PostAsync(id, profile.SquadId, me, text, ct);
        if (comment is null) return Results.NotFound();

        await hub.Clients.Group(SquadHub.SquadGroup(profile.SquadId))
            .SendAsync("activityComment", comment, ct);
        return Results.Ok(comment);
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }
}

public sealed record PostCommentRequest(string Body);
