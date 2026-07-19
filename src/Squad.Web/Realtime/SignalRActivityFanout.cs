// ===========================================================================
//  SignalRActivityFanout.cs
//  Runs after a NEW or REPLACED Activity commits (the worker only calls this for
//  non-duplicates). Enriches the canonical model with athlete display info, builds
//  the feed card, and pushes it to the athlete's squad group — plus a lightweight
//  "leaderboardChanged" nudge so ranked views can refetch.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

public sealed class SignalRActivityFanout(
    IHubContext<SquadHub> hub,
    IAthleteDirectory directory) : IActivityFanout
{
    public async Task OnActivityCommittedAsync(Activity a, CancellationToken ct)
    {
        var athlete = await directory.GetAsync(a.AthleteId, ct);
        if (athlete is null) return; // no profile → nothing to show; leaderboard job can still run elsewhere

        var item = FeedCard.From(a, athlete);
        var group = hub.Clients.Group(SquadHub.SquadGroup(athlete.SquadId));

        await group.SendAsync("activityPosted", item, ct);
        await group.SendAsync("leaderboardChanged", ct);

        // TODO: enqueue/update leaderboard aggregate tables here (or raise a domain event
        // the leaderboard projection subscribes to). The push above just tells clients to refetch.
    }
}
