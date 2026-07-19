using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Squad group chat. One group per squad; on connect we resolve the caller's
/// active squad from their identity (never trust a client-supplied group) and add
/// them, so a message posted to <see cref="ChatGroup"/> reaches that squad's members.
/// Sending goes through the REST endpoint (persist + fan-out); the hub is receive-only.
/// </summary>
[Authorize]
public sealed class ChatHub(IAthleteDirectory directory) : Hub
{
    public static string ChatGroup(Guid squadId) => $"chat:{squadId}";

    public override async Task OnConnectedAsync()
    {
        var claim = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier) ?? Context.User?.FindFirstValue("sub");
        if (Guid.TryParse(claim, out var athleteId))
        {
            var profile = await directory.GetAsync(athleteId, Context.ConnectionAborted);
            if (profile is not null)
                await Groups.AddToGroupAsync(Context.ConnectionId, ChatGroup(profile.SquadId));
        }
        await base.OnConnectedAsync();
    }
}

public static class ChatHubEndpoints
{
    public static IEndpointRouteBuilder MapChatHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<ChatHub>("/hubs/chat");
        return app;
    }
}
