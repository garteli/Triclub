using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// A teammate's public profile: identity + training fields (from the profile),
/// this week's loads/streak/rank (from the leaderboard), recent activity (from the
/// activity read model), and whether the caller follows them. Plus follow/unfollow.
/// Composed from existing services — no new read model needed.
/// </summary>
public static class AthleteEndpoints
{
    public static IEndpointRouteBuilder MapAthletes(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/athletes").RequireAuthorization();
        g.MapGet("/{id:guid}", Get);
        g.MapPost("/{id:guid}/follow", Follow);
        g.MapDelete("/{id:guid}/follow", Unfollow);
        return app;
    }

    private static async Task<IResult> Get(
        Guid id, HttpContext http,
        IProfileService profiles, ILeaderboardService leaderboard,
        IActivityReadService activities, IFollowService follows, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();

        var p = await profiles.GetAsync(id, ct);
        if (p is null) return Results.NotFound();

        // Weekly standing within their squad (loads, streak, rank).
        var board = await leaderboard.GetWeeklyAsync(p.SquadId, me, DateTimeOffset.UtcNow, ct);
        var row = board.FirstOrDefault(r => r.AthleteId == id);
        var rank = row is null ? 0 : board.ToList().FindIndex(r => r.AthleteId == id) + 1;

        // Their recent activity (filter the squad feed to this athlete).
        var squadActs = await activities.GetForSquadAsync(p.SquadId, 60, ct);
        var recent = squadActs.Where(a => a.AthleteId == id).Take(5).Select(FeedCard.From).ToList();

        var isMe = id == me;
        var isFollowing = !isMe && await follows.IsFollowingAsync(me, id, ct);

        return Results.Ok(new
        {
            id = p.Id, isMe, isFollowing,
            name = p.Name, initials = p.Initials, color = p.AvatarColor,
            club = p.Club, ageGroup = p.AgeGroup, sport = p.PrimarySport, level = p.Level,
            ftp = p.Ftp, weekly = p.WeeklyHours, bio = p.Bio,
            rank,
            streak = row?.Streak ?? 0,
            volumeHours = row?.VolumeHours ?? 0,
            loads = new
            {
                swim = (int)Math.Round(row?.SwimLoad ?? 0),
                bike = (int)Math.Round(row?.BikeLoad ?? 0),
                run = (int)Math.Round(row?.RunLoad ?? 0),
            },
            recent,
        });
    }

    private static async Task<IResult> Follow(Guid id, HttpContext http, IFollowService follows, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        await follows.FollowAsync(me, id, ct);
        return Results.Ok(new { following = true });
    }

    private static async Task<IResult> Unfollow(Guid id, HttpContext http, IFollowService follows, CancellationToken ct)
    {
        if (!TryMe(http, out var me)) return Results.Unauthorized();
        await follows.UnfollowAsync(me, id, ct);
        return Results.Ok(new { following = false });
    }

    private static bool TryMe(HttpContext http, out Guid id)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out id);
    }
}
