using System.Globalization;
using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>Group/club target races for a squad. The coach (owner) adds targets — from an event URL
/// (the AI extracts name/date/location, same as the personal goal race) or manually — and members
/// browse them. Members adopt a target as their own goal via the existing POST /api/profile/goal.</summary>
public static class SquadTargetEndpoints
{
    public static IEndpointRouteBuilder MapSquadTargets(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/squads/{squadId:guid}/targets", ListTargets).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/targets", AddTarget).RequireAuthorization();
        app.MapDelete("/api/squads/{squadId:guid}/targets/{targetId:guid}", RemoveTarget).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> ListTargets(Guid squadId, ISquadTargetStore targets, CancellationToken ct)
    {
        var list = await targets.ListAsync(squadId, ct);
        return Results.Ok(list.Select(ToDto));
    }

    private static async Task<IResult> AddTarget(
        Guid squadId, SquadTargetRequest req, HttpContext http,
        ISquadTargetStore targets, IRaceInfoService raceInfo, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        // Check ownership before spending an AI call.
        if (!await targets.IsOwnerAsync(squadId, me, ct))
            return Results.Json(new { error = "Only the group manager can add targets." }, statusCode: 403);

        var url = Trim(req.Url);
        var name = Trim(req.Name);

        string tName;
        string? date, location;
        if (name is not null)
        {
            tName = name.Length > 120 ? name[..120] : name;
            date = NormalizeDate(req.Date);
            location = Trim(req.Location);
        }
        else if (url is not null)
        {
            if (!raceInfo.Configured)
                return Results.Json(new { error = "AI race lookup isn't set up on the server yet." }, statusCode: 503);
            var result = await raceInfo.ExtractAsync(url, ct);
            if (!result.Ok || result.Race is null)
                return Results.Json(new { error = result.Error ?? "Couldn't read that event page." }, statusCode: 422);
            tName = result.Race.Name ?? "Race";
            date = result.Race.Date;
            location = result.Race.Location;
        }
        else
        {
            return Results.BadRequest(new { error = "Provide an event URL or a race name." });
        }

        var added = await targets.AddAsync(squadId, me, tName, date, location, url, ct);
        return added is null
            ? Results.Json(new { error = "Only the group manager can add targets." }, statusCode: 403)
            : Results.Ok(ToDto(added));
    }

    private static async Task<IResult> RemoveTarget(
        Guid squadId, Guid targetId, HttpContext http, ISquadTargetStore targets, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var ok = await targets.RemoveAsync(squadId, me, targetId, ct);
        return ok
            ? Results.Ok(new { removed = true })
            : Results.Json(new { error = "Only the group manager can remove targets." }, statusCode: 403);
    }

    // ── helpers ──
    private static object ToDto(SquadTarget t) =>
        new { id = t.Id, name = t.Name, date = t.RaceDate, location = t.Location, url = t.EventUrl };

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static string? Trim(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static string? NormalizeDate(string? raw)
    {
        var s = Trim(raw);
        if (s is null) return null;
        return DateTime.TryParse(s, CultureInfo.InvariantCulture, DateTimeStyles.None, out var d)
            ? d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture)
            : null;
    }

    /// <summary>Body for adding a group target: an event URL for AI extraction, or explicit fields.</summary>
    public sealed record SquadTargetRequest(string? Url, string? Name, string? Date, string? Location);
}
