// ===========================================================================
//  SignalRActivityFanout.cs
//  Runs after a NEW or REPLACED Activity commits (the worker only calls this for
//  non-duplicates). Enriches the canonical model with athlete display info, builds
//  the feed card, and pushes it to the athlete's squad group — plus a lightweight
//  "leaderboardChanged" nudge so ranked views can refetch.
// ===========================================================================
using System;
using System.Globalization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;

namespace Squad.Ingest.Feed;

public sealed class SignalRActivityFanout(
    IHubContext<SquadHub> hub,
    IAthleteDirectory directory) : IActivityFanout
{
    public async Task OnActivityCommittedAsync(Activity a, CancellationToken ct)
    {
        var athlete = await directory.GetAsync(a.AthleteId, ct);
        if (athlete is null) return; // no profile → nothing to show; leaderboard job can still run elsewhere

        var item = Map(a, athlete);
        var group = hub.Clients.Group(SquadHub.SquadGroup(athlete.SquadId));

        await group.SendAsync("activityPosted", item, ct);
        await group.SendAsync("leaderboardChanged", ct);

        // TODO: enqueue/update leaderboard aggregate tables here (or raise a domain event
        // the leaderboard projection subscribes to). The push above just tells clients to refetch.
    }

    private static ActivityFeedItem Map(Activity a, AthleteProfile p)
    {
        var (icon, disc, verb) = a.Sport switch
        {
            ActivitySport.Bike => ("🚴", "var(--bike)", "rode"),
            ActivitySport.Run  => ("🏃", "var(--run)", "ran"),
            ActivitySport.Swim => ("🏊", "var(--swim)", "swam"),
            _                  => ("🏋️", "var(--gym)", "logged a session"),
        };

        return new ActivityFeedItem
        {
            Id = a.Id,
            AthleteId = a.AthleteId,
            AthleteName = p.Name,
            Initials = p.Initials,
            AvatarColor = p.AvatarColor,
            Sport = a.Sport.ToString(),
            Icon = icon,
            DiscColor = disc,
            Action = BuildAction(a, verb),
            Metric = BuildMetric(a),
            StartUtc = a.StartUtc,
            Reacts = 0,
        };
    }

    private static string BuildAction(Activity a, string verb)
    {
        if (a.DistanceMeters is not > 0) return verb == "logged a session" ? verb : $"{verb} a session";
        // Swim reads better in metres; everything else in km.
        return a.Sport == ActivitySport.Swim
            ? $"{verb} {a.DistanceMeters.Value:N0} m"
            : $"{verb} {(a.DistanceMeters.Value / 1000.0).ToString("0.0", CultureInfo.InvariantCulture)} km";
    }

    private static string BuildMetric(Activity a)
    {
        var parts = new System.Collections.Generic.List<string>(3);

        var mt = a.MovingTime;
        if (mt > TimeSpan.Zero)
            parts.Add(mt.TotalHours >= 1
                ? $"{(int)mt.TotalHours}:{mt.Minutes:00}"
                : $"{mt.Minutes}:{mt.Seconds:00}");

        if (a.TrainingLoad is > 0) parts.Add($"{a.TrainingLoad.Value:N0} TSS");
        else if (a.AvgHeartRate is > 0) parts.Add($"{a.AvgHeartRate.Value:N0} bpm avg");

        return string.Join(" · ", parts);
    }
}
