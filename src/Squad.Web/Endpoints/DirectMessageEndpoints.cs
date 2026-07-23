using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Direct (1:1) messages. History + send between the caller and one peer athlete.
/// Mirrors the squad chat's REST-write + hub-fanout shape, but delivery targets the
/// two participants' personal hub groups (<see cref="ChatHub.UserGroup"/>) rather than
/// a squad group. Messaging is restricted to members of the caller's active squad.
/// </summary>
public static class DirectMessageEndpoints
{
    public static IEndpointRouteBuilder MapDirectMessages(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/dm").RequireAuthorization();
        g.MapGet("/{peerId:guid}", GetThread);
        g.MapPost("/{peerId:guid}", Post);
        return app;
    }

    private static async Task<IResult> GetThread(
        Guid peerId, HttpContext http, IAthleteDirectory directory, IDirectMessageService dm,
        CancellationToken ct, int take = 50)
    {
        if (!TryMe(http, out var meId)) return Results.Unauthorized();
        if (!await SameSquad(directory, meId, peerId, ct)) return Results.Forbid();
        return Results.Ok(await dm.GetThreadAsync(meId, peerId, take, ct));
    }

    private static async Task<IResult> Post(
        Guid peerId, SendMessageRequest body, HttpContext http, IAthleteDirectory directory,
        IDirectMessageService dm, IHubContext<ChatHub> hub, CancellationToken ct)
    {
        if (!TryMe(http, out var meId)) return Results.Unauthorized();
        var text = body.Body?.Trim();
        if (string.IsNullOrEmpty(text)) return Results.BadRequest(new { error = "Message body is required." });
        if (text.Length > 1000) return Results.BadRequest(new { error = "Message too long (max 1000 chars)." });
        if (meId == peerId) return Results.BadRequest(new { error = "Cannot message yourself." });
        if (!await SameSquad(directory, meId, peerId, ct)) return Results.Forbid();

        var message = await dm.PostAsync(meId, peerId, text, ct);
        if (message is null) return Results.Problem("Failed to persist message.");

        // Fan out to both participants' personal groups (sender included — the client dedupes by id).
        await hub.Clients.Groups(ChatHub.UserGroup(meId), ChatHub.UserGroup(peerId))
            .SendAsync("dmPosted", message, ct);
        return Results.Ok(message);
    }

    // Both athletes must exist and share the caller's active squad.
    private static async Task<bool> SameSquad(IAthleteDirectory directory, Guid me, Guid peer, CancellationToken ct)
    {
        if (me == peer) return false;
        var mine = await directory.GetAsync(me, ct);
        var theirs = await directory.GetAsync(peer, ct);
        return mine is not null && theirs is not null && mine.SquadId == theirs.SquadId;
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }
}
