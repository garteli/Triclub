using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Ad-hoc segment leaderboard: the client sends a stretch of road (a section of an activity's
/// route) and the server ranks every rider whose stored GPS track covered that same stretch.
/// No stored segment table — matching is on the fly (see <see cref="ISegmentBoardService"/>).
/// </summary>
public static class SegmentEndpoints
{
    public static IEndpointRouteBuilder MapSegments(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/segments/board", GetBoard).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> GetBoard(
        SegmentBoardRequest req, HttpContext http, ISegmentBoardService segments, IProfileService profiles, CancellationToken ct)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        if (!Guid.TryParse(claim, out var me)) return Results.Unauthorized();
        if (req.Path is null || req.Path.Count < 2 || req.LengthM <= 0)
            return Results.BadRequest(new { error = "A segment path and length are required." });

        // The "squad" scope ranks the viewer's own club — derive it server-side, don't trust the client.
        var p = await profiles.GetAsync(me, ct);
        if (p is null) return Results.Unauthorized();

        var board = await segments.GetAsync(p.SquadId, me, req, ct);
        return Results.Ok(board);
    }
}
