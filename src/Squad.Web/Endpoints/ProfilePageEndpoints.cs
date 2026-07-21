using System.Globalization;
using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// The signed-in athlete's own Profile page: identity + this-week standing (from the
/// leaderboard) + everything derived from their real activities (volume, fitness trend,
/// discipline totals, personal bests, achievements) + their goal race. Plus setting the
/// goal race from an event URL (the AI extracts name/date/location) or manually.
///
/// Composed from existing services + <see cref="IProfileStatsService"/> — no fabricated
/// numbers: sections with no data come back empty and the client omits them.
/// </summary>
public static class ProfilePageEndpoints
{
    public static IEndpointRouteBuilder MapProfilePage(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/profile").RequireAuthorization();
        g.MapGet("/page", GetPage);
        g.MapPut("/goal", SetGoal);
        g.MapPost("/goal", SetGoal);
        g.MapDelete("/goal", ClearGoal);
        return app;
    }

    private static async Task<IResult> GetPage(
        HttpContext http,
        IProfileService profiles, ISquadService squads, ILeaderboardService leaderboard,
        IProfileStatsService stats, IGoalStore goals, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();

        var p = await profiles.GetAsync(me, ct);
        if (p is null) return Results.Unauthorized();

        var now = DateTimeOffset.UtcNow;

        // This week's standing within the squad (streak + club rank + squad size).
        var board = await leaderboard.GetWeeklyAsync(p.SquadId, me, now, ct);
        var boardList = board.ToList();
        var row = boardList.FirstOrDefault(r => r.AthleteId == me);
        var rank = row is null ? 0 : boardList.FindIndex(r => r.AthleteId == me) + 1;

        var squad = await squads.GetAsync(p.SquadId, me, ct);
        var s = await stats.GetAsync(me, now, ct);
        var goal = await goals.GetAsync(me, ct);

        return Results.Ok(new
        {
            id = p.Id,
            name = p.Name,
            initials = p.Initials,
            color = p.AvatarColor,
            avatarUrl = p.AvatarUrl,
            club = p.Club,
            ageGroup = p.AgeGroup,
            sport = p.PrimarySport,
            level = p.Level,

            squadId = p.SquadId,
            squadName = squad?.Name,
            squadMembers = squad?.MemberCount ?? boardList.Count,
            rank,
            streak = row?.Streak ?? 0,

            following = s.Following,
            followers = s.Followers,
            activityCount = s.ActivityCount,
            yearDistanceKm = s.YearDistanceKm,

            ctl = s.CtlNow,
            atl = s.AtlNow,
            tsb = s.Tsb,
            thisWeekHours = s.ThisWeekHours,
            weekHoursDelta = s.WeekHoursDelta,

            goal = ToGoalDto(goal, now),

            weekVolumes = s.WeekVolumes,
            fitness = s.Fitness,
            disciplines = s.Disciplines,
            personalBests = s.PersonalBests,
            achievements = s.Achievements,
        });
    }

    private static async Task<IResult> SetGoal(
        GoalRequest req, HttpContext http, IGoalStore goals, IRaceInfoService raceInfo, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();

        var url = Trim(req.Url);
        var name = Trim(req.Name);

        AthleteGoal goal;
        if (name is not null)
        {
            // Manual entry (or the client confirming AI-extracted values).
            goal = new AthleteGoal(name, NormalizeDate(req.Date), Trim(req.Location), url);
        }
        else if (url is not null)
        {
            // Extract the race from the event page via the AI.
            if (!raceInfo.Configured)
                return Results.Json(new { error = "AI race lookup isn't set up on the server yet." }, statusCode: 503);

            var result = await raceInfo.ExtractAsync(url, ct);
            if (!result.Ok || result.Race is null)
                return Results.Json(new { error = result.Error ?? "Couldn't read that event page." }, statusCode: 422);

            goal = new AthleteGoal(result.Race.Name!, result.Race.Date, result.Race.Location, url);
        }
        else
        {
            return Results.BadRequest(new { error = "Provide an event URL or a race name." });
        }

        await goals.SetAsync(me, goal, ct);
        return Results.Ok(ToGoalDto(goal, DateTimeOffset.UtcNow));
    }

    private static async Task<IResult> ClearGoal(HttpContext http, IGoalStore goals, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        await goals.ClearAsync(me, ct);
        return Results.Ok(new { cleared = true });
    }

    // ── helpers ──
    private static object? ToGoalDto(AthleteGoal? goal, DateTimeOffset now)
    {
        if (goal is null) return null;
        return new
        {
            name = goal.Name,
            date = goal.RaceDate,
            location = goal.Location,
            url = goal.EventUrl,
            daysToGo = DaysToGo(goal.RaceDate, now),
        };
    }

    private static int? DaysToGo(string? isoDate, DateTimeOffset now)
    {
        if (string.IsNullOrWhiteSpace(isoDate)) return null;
        if (!DateTime.TryParse(isoDate, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)) return null;
        return (int)Math.Ceiling((d.Date - now.UtcDateTime.Date).TotalDays);
    }

    private static string? NormalizeDate(string? raw)
    {
        var s = Trim(raw);
        if (s is null) return null;
        return DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;
    }

    private static string? Trim(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }

    /// <summary>Body for setting the goal race: an event URL for AI extraction, and/or
    /// explicit fields (a manual entry, or the client confirming extracted values).</summary>
    public sealed record GoalRequest(string? Url, string? Name, string? Date, string? Location);
}
