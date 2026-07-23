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
        // Squad-scoped: any member lists; the owner creates/edits/publishes/deletes + sees the roster.
        app.MapGet("/api/squads/{squadId:guid}/events", ListEvents).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events", CreateEvent).RequireAuthorization();
        app.MapPut("/api/squads/{squadId:guid}/events/{eventId:guid}", UpdateEvent).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events/{eventId:guid}/publish", PublishEvent).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events/{eventId:guid}/unpublish", UnpublishEvent).RequireAuthorization();
        app.MapGet("/api/squads/{squadId:guid}/events/{eventId:guid}/attendees", EventAttendees).RequireAuthorization();
        app.MapGet("/api/squads/{squadId:guid}/events/{eventId:guid}/participants", EventParticipants).RequireAuthorization();
        app.MapGet("/api/squads/{squadId:guid}/events/{eventId:guid}/route", EventRoute).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events/{eventId:guid}/startplace", SetStartPlace).RequireAuthorization();
        app.MapDelete("/api/squads/{squadId:guid}/events/{eventId:guid}", DeleteEvent).RequireAuthorization();
        // Owner-only: pending event-join requests from non-members, per event and approve/decline.
        app.MapGet("/api/squads/{squadId:guid}/events/{eventId:guid}/requests", EventRequests).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events/{eventId:guid}/requests/{athleteId:guid}/approve", ApproveEventRequest).RequireAuthorization();
        app.MapPost("/api/squads/{squadId:guid}/events/{eventId:guid}/requests/{athleteId:guid}/decline", DeclineEventRequest).RequireAuthorization();
        // The owner's cross-squad pending event-request inbox (the unified requests screen).
        app.MapGet("/api/events/requests", MyEventRequests).RequireAuthorization();
        // Member-scoped RSVP + check-in, plus the caller's own joined-events list.
        app.MapPost("/api/events/{eventId:guid}/join", JoinEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/leave", LeaveEvent).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/checkin", CheckIn).RequireAuthorization();
        app.MapPost("/api/events/{eventId:guid}/uncheckin", UndoCheckIn).RequireAuthorization();
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

        var parsed = await ParseEvent(req, me, courses, ct);
        if (parsed.Error is { } err) return err;

        // A draft (published == false) is created silently; a published event fans out below.
        var published = req.Published ?? true;
        var created = await events.CreateAsync(
            squadId, me, parsed.Title!, parsed.Sport, parsed.Start,
            parsed.CourseId, parsed.CourseName, parsed.CourseKm, parsed.CoursePoints, parsed.Notes, published, ct);
        if (created is null)
            return Results.Json(new { error = "Only the group manager can schedule sessions." }, statusCode: 403);

        if (published)
            await NotifySquad(squadId, me, parsed.Title!, squads, notes, directory, ct);

        return Results.Ok(ToDto(created));
    }

    private static async Task<IResult> UpdateEvent(
        Guid squadId, Guid eventId, SquadEventRequest req, HttpContext http,
        ISquadEventStore events, ICourseStore courses, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (!await events.IsOwnerAsync(squadId, me, ct))
            return Results.Json(new { error = "Only the group manager can edit sessions." }, statusCode: 403);

        var parsed = await ParseEvent(req, me, courses, ct);
        if (parsed.Error is { } err) return err;

        var ok = await events.UpdateAsync(
            squadId, me, eventId, parsed.Title!, parsed.Sport, parsed.Start,
            parsed.CourseId, parsed.CourseName, parsed.CourseKm, parsed.CoursePoints, parsed.Notes, ct);
        return ok
            ? Results.Ok(new { updated = true })
            : Results.NotFound(new { error = "That session no longer exists." });
    }

    private static async Task<IResult> PublishEvent(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events,
        ISquadService squads, INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var result = await events.SetPublishedAsync(squadId, me, eventId, true, ct);
        if (result == SetPublishedResult.NotAllowed)
            return Results.Json(new { error = "Only the group manager can publish sessions." }, statusCode: 403);

        // Notify the squad only on a genuine draft→published transition.
        if (result == SetPublishedResult.PublishedNow)
        {
            var title = (await events.ListForSquadAsync(squadId, me, ct))
                .FirstOrDefault(e => e.Id == eventId)?.Title ?? "a group session";
            await NotifySquad(squadId, me, title, squads, notes, directory, ct);
        }
        return Results.Ok(new { published = true });
    }

    private static async Task<IResult> UnpublishEvent(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var result = await events.SetPublishedAsync(squadId, me, eventId, false, ct);
        return result == SetPublishedResult.NotAllowed
            ? Results.Json(new { error = "Only the group manager can unpublish sessions." }, statusCode: 403)
            : Results.Ok(new { published = false });
    }

    private static async Task<IResult> EventAttendees(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListAttendeesAsync(squadId, me, eventId, ct);
        return list is null
            ? Results.Json(new { error = "Only the group manager can see the roster." }, statusCode: 403)
            : Results.Ok(list.Select(a => new
            {
                athleteId = a.AthleteId,
                name = a.Name,
                initials = a.Initials,
                avatarColor = a.AvatarColor,
                avatarUrl = a.AvatarUrl,
                joinedUtc = a.JoinedUtc,
                checkedIn = a.CheckedInUtc != null,
                checkedInUtc = a.CheckedInUtc,
            }));
    }

    // Member-facing roster for the event page — any signed-in athlete can see a published event's
    // participants (404 if the event isn't visible to them).
    private static async Task<IResult> EventParticipants(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListParticipantsAsync(squadId, me, eventId, ct);
        return list is null
            ? Results.NotFound(new { error = "That session no longer exists." })
            : Results.Ok(list.Select(a => new
            {
                athleteId = a.AthleteId,
                name = a.Name,
                initials = a.Initials,
                avatarColor = a.AvatarColor,
                avatarUrl = a.AvatarUrl,
                checkedIn = a.CheckedInUtc != null,
                you = a.AthleteId == me,   // the caller's own row — not tappable on the client
            }));
    }

    // The event's route geometry for drawing the map on the member-facing event page. Serves the
    // points denormalized onto the event, so a member needn't own the (owner-scoped) source course.
    private static async Task<IResult> EventRoute(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var json = await events.GetRouteAsync(squadId, me, eventId, ct);
        if (string.IsNullOrWhiteSpace(json)) return Results.NotFound(new { error = "No route for this session." });
        using var doc = System.Text.Json.JsonDocument.Parse(json);
        return Results.Ok(new { points = doc.RootElement.Clone() });
    }

    // Cache the reverse-geocoded start-point name the client resolved, so later loads reuse it.
    private static async Task<IResult> SetStartPlace(
        Guid squadId, Guid eventId, StartPlaceRequest req, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var place = Trim(req?.Place);
        if (string.IsNullOrEmpty(place)) return Results.BadRequest(new { error = "A place name is required." });
        if (place.Length > 120) place = place[..120];
        await events.SetStartPlaceAsync(squadId, me, eventId, place, ct);
        return Results.Ok(new { place });
    }

    private sealed record StartPlaceRequest(string? Place);

    // Resolve + validate the shared event fields (title/sport/start/route/notes). Returns a parsed
    // bundle, or an Error result to short-circuit the handler.
    private static async Task<ParsedEvent> ParseEvent(SquadEventRequest req, Guid me, ICourseStore courses, CancellationToken ct)
    {
        var title = Trim(req.Title);
        if (title is null) return ParsedEvent.Fail(Results.BadRequest(new { error = "Give the session a title." }));
        if (title.Length > 160) title = title[..160];

        if (!TryParseStart(req.Start, out var start))
            return ParsedEvent.Fail(Results.BadRequest(new { error = "Pick a valid date and time." }));

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
            if (course is null) return ParsedEvent.Fail(Results.BadRequest(new { error = "That route wasn't found." }));
            courseId = course.Id;
            courseName = course.Name;
            courseKm = course.DistanceKm;
            coursePoints = course.Points;
        }

        return new ParsedEvent(null, title, sport, start, courseId, courseName, courseKm, coursePoints, notesText);
    }

    // Best-effort fan-out of an "event" notification to every other squad member.
    private static async Task NotifySquad(
        Guid squadId, Guid me, string title, ISquadService squads,
        INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        try
        {
            var members = await squads.GetMembersAsync(squadId, me, ct);
            if (members is null) return;
            var coachName = (await directory.GetAsync(me, ct))?.Name ?? "Your coach";
            var text = $"scheduled a group session: \"{title}\"";
            foreach (var m in members.Where(m => m.AthleteId != me))
                await notes.AddAsync(m.AthleteId, "event", me, coachName, text, squadId, ct);
        }
        catch (Exception) { /* the write already succeeded; notifications are best-effort */ }
    }

    private sealed record ParsedEvent(
        IResult? Error, string? Title, byte Sport, DateTimeOffset Start,
        Guid? CourseId, string? CourseName, double? CourseKm, string? CoursePoints, string? Notes)
    {
        public static ParsedEvent Fail(IResult error) => new(error, null, 0, default, null, null, null, null, null);
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

    private static async Task<IResult> JoinEvent(
        Guid eventId, HttpContext http, ISquadEventStore events,
        INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var result = await events.JoinAsync(eventId, me, ct);
        switch (result.Outcome)
        {
            case EventJoinOutcome.NotFound:
                return Results.NotFound(new { error = "That session no longer exists." });
            case EventJoinOutcome.Requested:
                // Notify the coach that a non-member has asked to join this event (best-effort).
                try
                {
                    var asker = (await directory.GetAsync(me, ct))?.Name ?? "Someone";
                    if (result.OwnerId != me)
                        await notes.AddAsync(result.OwnerId, "request", me, asker, $"asked to join \"{result.Title}\"", result.SquadId, ct);
                }
                catch (Exception) { /* the request is saved; the notification is best-effort */ }
                return Results.Ok(new { requested = true });
            case EventJoinOutcome.AlreadyRequested:
                return Results.Ok(new { requested = true });
            default: // Joined / AlreadyJoined
                return Results.Ok(new { joined = true });
        }
    }

    private static async Task<IResult> EventRequests(
        Guid squadId, Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListPendingForEventAsync(squadId, me, eventId, ct);
        return list is null
            ? Results.Json(new { error = "Only the group manager can review requests." }, statusCode: 403)
            : Results.Ok(list.Select(a => new
            {
                athleteId = a.AthleteId,
                name = a.Name,
                initials = a.Initials,
                avatarColor = a.AvatarColor,
                avatarUrl = a.AvatarUrl,
                requestedUtc = a.JoinedUtc,
            }));
    }

    private static async Task<IResult> MyEventRequests(HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var list = await events.ListPendingEventRequestsForOwnerAsync(me, ct);
        return Results.Ok(list.Select(r => new
        {
            squadId = r.SquadId,
            eventId = r.EventId,
            eventTitle = r.EventTitle,
            start = r.StartUtc,
            athleteId = r.AthleteId,
            athleteName = r.AthleteName,
            initials = r.Initials,
            avatarColor = r.AvatarColor,
            avatarUrl = r.AvatarUrl,
            requestedUtc = r.RequestedUtc,
        }));
    }

    private static async Task<IResult> ApproveEventRequest(
        Guid squadId, Guid eventId, Guid athleteId, HttpContext http,
        ISquadEventStore events, INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var title = await events.ApproveEventRequestAsync(squadId, me, eventId, athleteId, ct);
        if (title is null) return Results.NotFound(new { error = "No pending request, or you don't manage this group." });
        try
        {
            var coach = (await directory.GetAsync(me, ct))?.Name ?? "Your coach";
            await notes.AddAsync(athleteId, "approved", me, coach, $"approved you to join \"{title}\"", squadId, ct);
        }
        catch (Exception) { /* the approval is saved; the notification is best-effort */ }
        return Results.Ok(new { status = "approved" });
    }

    private static async Task<IResult> DeclineEventRequest(
        Guid squadId, Guid eventId, Guid athleteId, HttpContext http,
        ISquadEventStore events, INotificationService notes, IAthleteDirectory directory, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var title = await events.DeclineEventRequestAsync(squadId, me, eventId, athleteId, ct);
        if (title is null) return Results.NotFound(new { error = "No pending request, or you don't manage this group." });
        try
        {
            var coach = (await directory.GetAsync(me, ct))?.Name ?? "Your coach";
            await notes.AddAsync(athleteId, "declined", me, coach, $"declined your request to join \"{title}\"", squadId, ct);
        }
        catch (Exception) { /* the decline is saved; the notification is best-effort */ }
        return Results.Ok(new { status = "declined" });
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

    private static async Task<IResult> UndoCheckIn(Guid eventId, HttpContext http, ISquadEventStore events, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var ok = await events.UndoCheckInAsync(eventId, me, ct);
        return ok ? Results.Ok(new { checkedIn = false }) : Results.NotFound(new { error = "That session no longer exists." });
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
        published = e.Published,
        myActivityId = e.MyActivityId,      // the caller's recorded ride for this event, if any
        logoUrl = e.LogoUrl,
        bannerUrl = e.BannerUrl,
        requestPending = e.RequestPending,  // caller has an unapproved join request
        member = e.Member,                  // caller is a member of the event's squad (joins instantly)
        startPlace = e.StartPlace,          // cached reverse-geocoded name of the route's start
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
        published = e.Published,
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

    /// <summary>Body for scheduling/editing a session. Start is ISO 8601 (with the client's offset);
    /// CourseId is an optional saved route; Sport is the ActivitySport byte (defaults to Bike);
    /// Published (create only, defaults true) schedules a draft when false.</summary>
    public sealed record SquadEventRequest(string? Title, int? Sport, string? Start, string? CourseId, string? Notes, bool? Published = null);
}
