using System.Security.Claims;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Squad chat: history + send. A sent message is persisted then pushed live to the
/// squad's chat group (mirrors the feed's REST-write + hub-fanout architecture).
/// Both operate on the caller's active squad (dbo.Athlete.SquadId).
/// </summary>
public static class ChatEndpoints
{
    public static IEndpointRouteBuilder MapChat(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/messages").RequireAuthorization();
        g.MapGet("", GetHistory);
        g.MapPost("", Post);
        g.MapDelete("/{id:guid}", Delete);
        return app;
    }

    private static async Task<IResult> GetHistory(
        HttpContext http, IAthleteDirectory directory, IChatService chat, CancellationToken ct, int take = 50)
    {
        var squad = await ActiveSquad(http, directory, ct);
        if (squad is null) return Results.Unauthorized();
        return Results.Ok(await chat.GetRecentAsync(squad.Value, take, ct));
    }

    private static async Task<IResult> Post(
        SendMessageRequest body, HttpContext http, IAthleteDirectory directory,
        IChatService chat, IHubContext<ChatHub> hub, CancellationToken ct)
    {
        if (!TryMe(http, out var athleteId)) return Results.Unauthorized();
        var text = body.Body?.Trim();
        if (string.IsNullOrEmpty(text)) return Results.BadRequest(new { error = "Message body is required." });
        if (text.Length > 1000) return Results.BadRequest(new { error = "Message too long (max 1000 chars)." });

        var profile = await directory.GetAsync(athleteId, ct);
        if (profile is null) return Results.Unauthorized();

        var message = await chat.PostAsync(profile.SquadId, athleteId, text, ct);
        if (message is null) return Results.Problem("Failed to persist message.");

        // Fan out to the squad's chat group (senders included — the client dedupes by id).
        await hub.Clients.Group(ChatHub.ChatGroup(profile.SquadId)).SendAsync("messagePosted", message, ct);
        return Results.Ok(message);
    }

    private static async Task<IResult> Delete(
        Guid id, HttpContext http, IChatService chat, IHubContext<ChatHub> hub, CancellationToken ct)
    {
        if (!TryMe(http, out var athleteId)) return Results.Unauthorized();

        var message = await chat.DeleteAsync(id, athleteId, ct);
        if (message is null) return Results.NotFound(); // not found, not theirs, or already deleted

        // Fan out the blanked message so open squad clients replace it with a "deleted" placeholder.
        await hub.Clients.Group(ChatHub.ChatGroup(message.SquadId)).SendAsync("messageDeleted", message, ct);
        return Results.Ok(message);
    }

    private static async Task<Guid?> ActiveSquad(HttpContext http, IAthleteDirectory directory, CancellationToken ct)
    {
        if (!TryMe(http, out var athleteId)) return null;
        var profile = await directory.GetAsync(athleteId, ct);
        return profile?.SquadId;
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }
}

public sealed record SendMessageRequest(string Body);
