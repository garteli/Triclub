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
/// One group per squad. On connect we resolve the caller's squad from their identity
/// (never trust a client-supplied group name) and add them to it, so a fan-out to
/// <see cref="SquadGroup"/> reaches exactly that squad's members.
/// </summary>
[Authorize]
public sealed class SquadHub(IAthleteDirectory directory) : Hub
{
    public static string SquadGroup(Guid squadId) => $"squad:{squadId}";

    public override async Task OnConnectedAsync()
    {
        var athleteId = ResolveAthleteId(Context.User);
        if (athleteId is not null)
        {
            var profile = await directory.GetAsync(athleteId.Value, Context.ConnectionAborted);
            if (profile is not null)
                await Groups.AddToGroupAsync(Context.ConnectionId, SquadGroup(profile.SquadId));
        }
        await base.OnConnectedAsync();
    }

    private static Guid? ResolveAthleteId(ClaimsPrincipal? user)
    {
        var claim = user?.FindFirstValue(ClaimTypes.NameIdentifier) ?? user?.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}

public static class SquadHubEndpoints
{
    public static IEndpointRouteBuilder MapSquadHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<SquadHub>("/hubs/squad");
        return app;
    }
}
