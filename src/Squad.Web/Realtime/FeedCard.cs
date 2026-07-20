using System.Globalization;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Builds the squad feed card. Shared by the live fan-out (SignalRActivityFanout)
/// and the initial-load endpoint (FeedEndpoints) so a card looks identical whether
/// it arrived over the hub or from the REST snapshot.
/// </summary>
public static class FeedCard
{
    /// <summary>From a committed canonical Activity (live push path). A just-posted activity
    /// has no kudos/comments yet, so those default to 0.</summary>
    public static ActivityFeedItem From(Activity a, AthleteProfile p) => Build(
        a.Id, a.AthleteId, p.Name, p.Initials, p.AvatarColor,
        a.Sport, a.StartUtc, (int)a.MovingTime.TotalSeconds,
        a.DistanceMeters, a.TrainingLoad, a.AvgHeartRate, reacts: 0, avatarUrl: p.AvatarUrl);

    /// <summary>From a joined read row (initial feed load path).</summary>
    public static ActivityFeedItem From(FeedActivityRow r) => Build(
        r.Id, r.AthleteId, r.AthleteName, r.Initials, r.AvatarColor,
        (ActivitySport)r.Sport, r.StartUtc, r.MovingTimeSec,
        r.DistanceMeters, r.TrainingLoad, r.AvgHeartRate, reacts: 0, avatarUrl: r.AvatarUrl,
        kudos: r.Kudos, comments: r.Comments, iKudoed: r.IKudoed);

    /// <summary>From an activity summary row (athlete-profile recent-activity list).</summary>
    public static ActivityFeedItem From(ActivitySummaryRow r) => Build(
        r.Id, r.AthleteId, r.AthleteName, r.Initials, r.AvatarColor,
        (ActivitySport)r.Sport, r.StartUtc, r.MovingTimeSec,
        r.DistanceMeters, r.TrainingLoad, r.AvgHeartRate, reacts: 0, avatarUrl: r.AvatarUrl,
        kudos: r.Kudos, comments: r.Comments, iKudoed: r.IKudoed);

    private static ActivityFeedItem Build(
        Guid id, Guid athleteId, string name, string initials, string color,
        ActivitySport sport, DateTimeOffset startUtc, int movingTimeSec,
        double? distanceMeters, double? trainingLoad, double? avgHeartRate, int reacts, string? avatarUrl = null,
        int kudos = 0, int comments = 0, bool iKudoed = false)
    {
        var (icon, disc, verb) = sport switch
        {
            ActivitySport.Bike => ("🚴", "var(--bike)", "rode"),
            ActivitySport.Run  => ("🏃", "var(--run)", "ran"),
            ActivitySport.Swim => ("🏊", "var(--swim)", "swam"),
            _                  => ("🏋️", "var(--gym)", "logged a session"),
        };

        return new ActivityFeedItem
        {
            Id = id,
            AthleteId = athleteId,
            AthleteName = name,
            Initials = initials,
            AvatarColor = color,
            Sport = sport.ToString(),
            Icon = icon,
            DiscColor = disc,
            Action = BuildAction(sport, distanceMeters, verb),
            Metric = BuildMetric(movingTimeSec, trainingLoad, avgHeartRate),
            StartUtc = startUtc,
            Reacts = reacts,
            AvatarUrl = avatarUrl,
            Kudos = kudos,
            Comments = comments,
            IKudoed = iKudoed,
        };
    }

    private static string BuildAction(ActivitySport sport, double? distanceMeters, string verb)
    {
        if (distanceMeters is not > 0) return verb == "logged a session" ? verb : $"{verb} a session";
        // Swim reads better in metres; everything else in km.
        return sport == ActivitySport.Swim
            ? $"{verb} {distanceMeters.Value:N0} m"
            : $"{verb} {(distanceMeters.Value / 1000.0).ToString("0.0", CultureInfo.InvariantCulture)} km";
    }

    private static string BuildMetric(int movingTimeSec, double? trainingLoad, double? avgHeartRate)
    {
        var parts = new List<string>(2);

        var mt = TimeSpan.FromSeconds(movingTimeSec);
        if (mt > TimeSpan.Zero)
            parts.Add(mt.TotalHours >= 1
                ? $"{(int)mt.TotalHours}:{mt.Minutes:00}"
                : $"{mt.Minutes}:{mt.Seconds:00}");

        if (trainingLoad is > 0) parts.Add($"{trainingLoad.Value:N0} TSS");
        else if (avgHeartRate is > 0) parts.Add($"{avgHeartRate.Value:N0} bpm avg");

        return string.Join(" · ", parts);
    }
}
