using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Initial feed load for the signed-in athlete's squad. The SquadHub pushes new
/// cards live after this; the client seeds its list from here on mount.
/// </summary>
public static class FeedEndpoints
{
    public static IEndpointRouteBuilder MapFeed(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/feed", GetFeed).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetFeed(
        HttpContext http,
        IAthleteDirectory directory,
        IFeedReadService feed,
        CancellationToken ct,
        int take = 30)
    {
        var id = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(id, out var athleteId)) return Results.Unauthorized();

        var profile = await directory.GetAsync(athleteId, ct);
        if (profile is null) return Results.Unauthorized();

        var rows = await feed.GetRecentAsync(profile.SquadId, athleteId, take, ct);
        var cards = rows.Select(FeedCard.From).ToList();
        return Results.Ok(cards);
    }
}
