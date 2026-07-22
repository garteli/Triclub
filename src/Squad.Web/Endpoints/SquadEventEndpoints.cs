using System.Globalization;
using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>Ad-hoc group sessions a coach (squad owner) schedules for a squad: pick a saved route,
/// a sport and a date+time, then publish it to members. Members join (an RSVP) and, on the day of the
/// event, check in to mark attendance. Create/delete are owner-only; join/leave/check-in are the member's.</summary>
public static class SquadEventEndpoints
{
    public static IEndpointRouteBuilder MapSquadEvents(this IEndpointRouteBuilder app)
    {
        // Squad-scoped: any member lists; the owner creates/deletes.
        app.MapGet("/api/squads/{squadId:guid}/events", ListEvents).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events", CreateEvent).RequireAuthorization();
        app.MapDelete("/api/squads/{squadId:guid}/events/{eventId:guid}", DeleteEvent).RequireAuthorization();
        // Member-scoped RSVP + check-in, plus the caller's own joined-events list.
        app.MapPost("/api/events/{eventId:guid}/join", JoinEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/leave", LeaveEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/checkin", CheckIn).RequireAuthorization();
        app.MapGet("/api/events/mine", MyEvents).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> ListEvents(Guid squadId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListForSquadAsync(squadId, me, ct);
        return Results.Ok(list.Select(ToDto));
    }

    private static async Task<IResult> MyEvents(HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListForMemberAsync(me, ct);
        return Results.Ok(list.Select(ToDto));
    }

    private static async Task<IResult> CreateEvent(
        Guid squadId, SquadEventRequest req, HttpContext http,
        ISquadEventStore events, ICourseStore courses, ISquadService squads,
        INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (!await events.IsOwnerAsync(squadId, me, ct))
            return Results.Json(new { error = "Only the group manager can schedule sessions." }, statusCode: 403);

        var title = Trim(req.Title);
        if (title is null) return Results.BadRequest(new { error = "Give the session a title." });
        if (title.Length > 160) title = title[..160];

        if (!TryParseStart(req.Start, out var start))
            return Results.BadRequest(new { error = "Pick a valid date and time." });

        var sport = (byte)Math.Clamp(req.Sport ?? 2, 0, 3);
        var notesText = Trim(req.Notes);
        if (notesText is { Length: > 500 }) notesText = notesText[..500];

        // Resolve the chosen route (owner-scoped) and denormalize its name/distance/points onto the
        // event so it renders even if the course is later deleted. A route is optional.
        Guid? courseId = null;
        string? courseName = null;
        double? courseKm = null;
        string? coursePoints = null;
        if (Guid.TryParse(req.CourseId, out var cid) && cid != Guid.Empty)
        {
            var course = await courses.GetAsync(me, cid, ct);
            if (course is null) return Results.BadRequest(new { error = "That route wasn't found." });
            courseId = course.Id;
            courseName = course.Name;
            courseKm = course.DistanceKm;
            coursePoints = course.Points;
        }

        var created = await events.CreateAsync(
            squadId, me, title, sport, start, courseId, courseName, courseKm, coursePoints, notesText, ct);
        if (created is null)
            return Results.Json(new { error = "Only the group manager can schedule sessions." }, statusCode: 403);

        // Tell the squad. Best-effort — a notification hiccup must not fail the create.
        try
        {
            var members = await squads.GetMembersAsync(squadId, me, ct);
            if (members is not null)
            {
                var coachName = (await directory.GetAsync(me, ct))?.Name ?? "Your coach";
                var text = $"scheduled a group session: \"{title}\"";
                foreach (var m in members.Where(m => m.AthleteId != me))
                    await notes.AddAsync(m.AthleteId, "event", me, coachName, text, ct);
            }
        }
        catch (Exception) { /* create already succeeded; notifications are best-effort */ }

        return Results.Ok(ToDto(created));
    }

    private static async Task<IResult> DeleteEvent(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var ok = await events.DeleteAsync(squadId, me, eventId, ct);
        return ok
            ? Results.Ok(new { removed = true })
            : Results.Json(new { error = "Only the group manager can remove sessions." }, statusCode: 403);
    }

    private static async Task<IResult> JoinEvent(Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var ok = await events.JoinAsync(eventId, me, ct);
        return ok ? Results.Ok(new { joined = true }) : Results.NotFound(new { error = "That session no longer exists." });
    }

    private static async Task<IResult> LeaveEvent(Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        await events.LeaveAsync(eventId, me, ct);
        return Results.Ok(new { joined = false });
    }

    private static async Task<IResult> CheckIn(Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var outcome = await events.CheckInAsync(eventId, me, ct);
        return outcome switch
        {
            CheckInOutcome.Ok => Results.Ok(new { checkedIn = true }),
            CheckInOutcome.NotFound => Results.NotFound(new { error = "That session no longer exists." }),
            CheckInOutcome.NotJoined => Results.Json(new { error = "Join the session before checking in." }, statusCode: 409),
            CheckInOutcome.NotToday => Results.Json(new { error = "Check-in opens on the day of the session." }, statusCode: 409),
            _ => Results.Problem("Couldn't check in."),
        };
    }

    // ── helpers ──
    private static object ToDto(SquadEventView e) => new
    {
        id = e.Id,
        squadId = e.SquadId,
        title = e.Title,
        sport = e.Sport,
        start = e.StartUtc,                 // ISO 8601 with offset — the client's check-in day gate needs it
        courseId = e.CourseId,
        courseName = e.CourseName,
        courseKm = e.CourseKm,
        notes = e.Notes,
        joinCount = e.JoinCount,
        checkedInCount = e.CheckedInCount,
        joined = e.Joined,
        checkedIn = e.CheckedInUtc != null,
    };

    private static object ToDto(SquadEvent e) => new
    {
        id = e.Id,
        squadId = e.SquadId,
        title = e.Title,
        sport = e.Sport,
        start = e.StartUtc,
        courseId = e.CourseId,
        courseName = e.CourseName,
        courseKm = e.CourseKm,
        notes = e.Notes,
        joinCount = 0,
        checkedInCount = 0,
        joined = false,
        checkedIn = false,
    };

    private static bool TryParseStart(string? raw, out DateTimeOffset start)
    {
        // Keep the supplied offset (the client sends the local time with its zone) so the day-of
        // check-in gate lines up with the member's calendar, not the server's.
        start = default;
        var s = Trim(raw);
        return s is not null && DateTimeOffset.TryParse(
            s, CultureInfo.InvariantCulture, DateTimeStyles.None, out start);
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }

    private static string? Trim(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    /// <summary>Body for scheduling a session. Start is ISO 8601 (with the client's offset); CourseId
    /// is an optional saved route; Sport is the ActivitySport byte (defaults to Bike).</summary>
    public sealed record SquadEventRequest(string? Title, int? Sport, string? Start, string? CourseId, string? Notes);
}
