using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Read side for the Activities screen: the signed-in athlete's squad activities,
/// newest first, with full summary metrics (the client renders both the list card
/// and the detail view from these rows, and flags the caller's own with `isMe`).
/// </summary>
public static class ActivityQueryEndpoints
{
    public static IEndpointRouteBuilder MapActivityQuery(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/activities", GetActivities).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetActivities(
        HttpContext http,
        IAthleteDirectory directory,
        IActivityReadService activities,
        CancellationToken ct,
        int take = 50)
    {
        var id = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(id, out var athleteId)) return Results.Unauthorized();

        var profile = await directory.GetAsync(athleteId, ct);
        if (profile is null) return Results.Unauthorized();

        var rows = await activities.GetForSquadAsync(profile.SquadId, take, ct);
        // Tag the caller's own rows so the client's "You" tab can filter without another call.
        var result = rows.Select(r => new
        {
            r.Id, r.AthleteId, r.AthleteName, r.Initials, r.AvatarColor,
            r.Sport, r.StartUtc, r.MovingTimeSec, r.ElapsedTimeSec,
            r.DistanceMeters, r.ElevationGainM, r.AvgHeartRate,
            r.AvgPowerWatts, r.TrainingLoad, r.Calories,
            isMe = r.AthleteId == athleteId,
        });
        return Results.Ok(result);
    }
}
