using System.Security.Claims;
using System.Text.Json;

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
        app.MapGet("/api/activities/{id:guid}/track", GetDetail).RequireAuthorization();
        app.MapDelete("/api/activities/{id:guid}", DeleteActivity).RequireAuthorization();
        return app;
    }

    // The recorded detail — { track, laps, matched } — for one activity, scoped to the caller's
    // squad. Empty track+laps when there's no recording (indoor) or the activity isn't visible;
    // `matched` lists squad-mates who rode the same place + time. The client renders the
    // map/traces/laps and the "rode together" card only when the data exists.
    private static async Task<IResult> GetDetail(
        Guid id, HttpContext http, IAthleteDirectory directory, IActivityReadService activities, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var athleteId)) return Results.Unauthorized();

        var profile = await directory.GetAsync(athleteId, ct);
        if (profile is null) return Results.Unauthorized();

        var detail = await activities.GetDetailAsync(id, profile.SquadId, ct) ?? new ActivityDetail([], []);
        var matched = await activities.GetMatchedRidesAsync(id, profile.SquadId, ct);
        return Results.Ok(new { track = detail.Track, laps = detail.Laps, matched });
    }

    // Delete one of the caller's own activities. Owner-scoped in the store, so a request
    // for someone else's (or a missing) activity is a 404 — never touches another's data.
    private static async Task<IResult> DeleteActivity(
        Guid id, HttpContext http, IActivityReadService activities, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var athleteId)) return Results.Unauthorized();

        var deleted = await activities.DeleteAsync(id, athleteId, ct);
        return deleted ? Results.NoContent() : Results.NotFound();
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

        var rows = await activities.GetForSquadAsync(profile.SquadId, athleteId, take, ct);

        // Weather is stored inline as JSON (ActivityWeather); hand the client the parsed object
        // so it serializes as a nested { tempC, apparentC, ... } rather than an escaped string.
        static ActivityWeather? ParseWeather(string? json)
        {
            if (string.IsNullOrEmpty(json)) return null;
            try { return JsonSerializer.Deserialize<ActivityWeather>(json); }
            catch (JsonException) { return null; }
        }

        // Tag the caller's own rows so the client's "You" tab can filter without another call.
        var result = rows.Select(r => new
        {
            r.Id, r.AthleteId, r.AthleteName, r.Initials, r.AvatarColor,
            r.Sport, r.StartUtc, r.MovingTimeSec, r.ElapsedTimeSec,
            r.DistanceMeters, r.ElevationGainM, r.AvgHeartRate,
            r.AvgPowerWatts, r.TrainingLoad, r.Calories, r.AvatarUrl,
            r.Kudos, r.Comments, r.IKudoed,
            r.DeviceName, weather = ParseWeather(r.WeatherJson),
            isMe = r.AthleteId == athleteId,
        });
        return Results.Ok(result);
    }
}
