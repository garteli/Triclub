using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace Squad.Ingest.Leaderboard;

public static class LeaderboardEndpoints
{
    public static IEndpointRouteBuilder MapLeaderboard(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/squads/{squadId:guid}/leaderboard", GetLeaderboard)
           .RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetLeaderboard(
        Guid squadId,
        HttpContext http,
        ILeaderboardService service,
        CancellationToken ct)
    {
        // 'me' just flags the caller's own row; null is fine.
        Guid? me = Guid.TryParse(
            http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub"),
            out var id) ? id : null;

        var rows = await service.GetWeeklyAsync(squadId, me, DateTimeOffset.UtcNow, ct);
        return Results.Ok(rows);
    }
}
