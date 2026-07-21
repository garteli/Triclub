using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

using Squad.Core;

namespace Squad.Web;

public static class ClubRankingEndpoints
{
    public static IEndpointRouteBuilder MapClubRanking(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/clubs/ranking", GetClubRanking)
           .RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetClubRanking(
        HttpContext http,
        IClubRankingService service,
        CancellationToken ct)
    {
        // 'me' just flags the caller's own club; null is fine.
        Guid? me = Guid.TryParse(
            http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub"),
            out var id) ? id : null;

        var rows = await service.GetWeeklyAsync(me, DateTimeOffset.UtcNow, ct);
        return Results.Ok(rows);
    }
}
