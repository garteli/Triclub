using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Core;

/// <summary>An ad-hoc group session a coach (squad owner) schedules: a saved route, a sport and a
/// date+time, published to the squad. Members join and, on the day, check in. Course fields are
/// denormalized from the source <see cref="Course"/> so the session survives the route's deletion.</summary>
public sealed record SquadEvent(
    Guid Id, Guid SquadId, Guid CreatedBy, string Title, byte Sport, DateTimeOffset StartUtc,
    Guid? CourseId, string? CourseName, double? CourseKm, string? CoursePoints, string? Notes,
    bool Published, DateTimeOffset CreatedUtc);

/// <summary>A squad event as seen by a member: the summary fields (no heavy points body) plus the
/// join/checked-in counts and this caller's own join + check-in state. <see cref="Published"/> is
/// only meaningful to the owner (members are never shown unpublished events).</summary>
public sealed record SquadEventView(
    Guid Id, Guid SquadId, string Title, byte Sport, DateTimeOffset StartUtc,
    Guid? CourseId, string? CourseName, double? CourseKm, string? Notes,
    int JoinCount, int CheckedInCount, bool Joined, DateTimeOffset? CheckedInUtc, bool Published,
    // The caller's activity recorded for this event (null if they haven't ridden it yet) — lets
    // the client show "you rode this" and open the ride. Column order matches ViewSelect.
    Guid? MyActivityId = null,
    // Optional per-event branding — proxy paths (null when unset). Column order matches ViewSelect.
    string? LogoUrl = null, string? BannerUrl = null,
    // Join gating: RequestPending = the caller has a pending (not-yet-approved) join request;
    // Member = the caller is a member (or owner) of the event's squad, so they join instantly
    // rather than requesting. Column order matches ViewSelect.
    bool RequestPending = false, bool Member = false,
    // Cached reverse-geocoded name of the route's start point (nearest town). Column order matches
    // ViewSelect. Null until a viewer with the route resolves + persists it via SetStartPlaceAsync.
    string? StartPlace = null);

/// <summary>The minimal fields for building an event's calendar (.ics) file: exactly what a
/// published event already exposes on its shareable page (title, when, place, notes).</summary>
public sealed record EventCalendarInfo(string Title, DateTimeOffset StartUtc, string? Notes, string? Place);

/// <summary>One member's attendance on an event, for the coach's joins/check-ins roster:
/// who joined, when, and whether (and when) they checked in.</summary>
public sealed record SquadEventAttendee(
    Guid AthleteId, string Name, string Initials, string AvatarColor,
    DateTimeOffset JoinedUtc, DateTimeOffset? CheckedInUtc, string? AvatarUrl);

/// <summary>Why a check-in was (or wasn't) accepted. <see cref="Ok"/> covers a fresh check-in and a
/// repeat of one already recorded (idempotent).</summary>
public enum CheckInOutcome { Ok, NotFound, NotJoined, NotToday }

/// <summary>Outcome of an event join. A member (or owner) of the event's squad joins instantly
/// (<see cref="Joined"/>); a non-member's join is a pending request the coach approves
/// (<see cref="Requested"/>). The Already* variants make the call idempotent.</summary>
public enum EventJoinOutcome { Joined, Requested, AlreadyJoined, AlreadyRequested, NotFound }

/// <summary>Result of <see cref="ISquadEventStore.JoinAsync"/> — the outcome plus the event's squad,
/// owner and title, so the caller can notify the coach of a new request without a second query.</summary>
public sealed record EventJoinResult(EventJoinOutcome Outcome, Guid SquadId, Guid OwnerId, string Title);

/// <summary>A pending event-join request from a non-member, for the coach's cross-squad inbox:
/// which event (squad + title + start) and who's asking.</summary>
public sealed record EventJoinRequestItem(
    Guid SquadId, Guid EventId, string EventTitle, DateTimeOffset StartUtc,
    Guid AthleteId, string AthleteName, string Initials, string AvatarColor, string? AvatarUrl,
    DateTimeOffset RequestedUtc);

/// <summary>Outcome of a publish/unpublish call. <see cref="PublishedNow"/> flags the
/// unpublished→published transition — the only case that should fan out notifications.</summary>
public enum SetPublishedResult { NotAllowed, PublishedNow, Unpublished, NoChange }

/// <summary>Persists a squad's ad-hoc group sessions and the per-member RSVP + check-in.
/// Create/delete are guarded to the squad's owner (coach).</summary>
public interface ISquadEventStore
{
    /// <summary>Upcoming events for a squad, with the caller's own join/check-in state.</summary>
    Task<IReadOnlyList<SquadEventView>> ListForSquadAsync(Guid squadId, Guid meId, CancellationToken ct);
    /// <summary>The caller's joined upcoming events across every squad, soonest first.</summary>
    Task<IReadOnlyList<SquadEventView>> ListForMemberAsync(Guid meId, CancellationToken ct);
    Task<bool> IsOwnerAsync(Guid squadId, Guid ownerId, CancellationToken ct);
    /// <summary>Create an event if <paramref name="ownerId"/> owns the squad; null otherwise.
    /// <paramref name="published"/> false schedules it as a draft (hidden from members).</summary>
    Task<SquadEvent?> CreateAsync(
        Guid squadId, Guid ownerId, string title, byte sport, DateTimeOffset startUtc,
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes,
        bool published, CancellationToken ct);
    /// <summary>Edit an event's details if <paramref name="ownerId"/> owns its squad; false otherwise.
    /// RSVPs/check-ins are preserved. Passing a course re-denormalizes its name/km/points.</summary>
    Task<bool> UpdateAsync(
        Guid squadId, Guid ownerId, Guid eventId, string title, byte sport, DateTimeOffset startUtc,
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes, CancellationToken ct);
    /// <summary>Publish or unpublish an event if <paramref name="ownerId"/> owns its squad; false otherwise.
    /// Returns whether this call flipped a previously-unpublished event to published (so the caller can
    /// fan out notifications only on a genuine publish transition).</summary>
    Task<SetPublishedResult> SetPublishedAsync(Guid squadId, Guid ownerId, Guid eventId, bool published, CancellationToken ct);
    /// <summary>The full join/check-in roster for an event (the confirmed 'going' attendees) — owner-only;
    /// null if the caller isn't the owner.</summary>
    Task<IReadOnlyList<SquadEventAttendee>?> ListAttendeesAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    /// <summary>Pending join requests for one event (non-members awaiting the coach's decision) — owner-only;
    /// null if the caller isn't the owner. Feeds the per-event roster's "Requests" section.</summary>
    Task<IReadOnlyList<SquadEventAttendee>?> ListPendingForEventAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    /// <summary>The owner's pending event-join requests across every squad they own — the unified inbox.</summary>
    Task<IReadOnlyList<EventJoinRequestItem>> ListPendingEventRequestsForOwnerAsync(Guid ownerId, CancellationToken ct);
    /// <summary>Approve a pending event-join request (owner-only): flips the RSVP to 'going'. Returns the
    /// event title on success (for notifying the requester); null if not owner or no pending request.</summary>
    Task<string?> ApproveEventRequestAsync(Guid squadId, Guid ownerId, Guid eventId, Guid athleteId, CancellationToken ct);
    /// <summary>Decline a pending event-join request (owner-only): removes the pending RSVP so the athlete
    /// may request again later. Returns the event title on success; null if not owner or no pending request.</summary>
    Task<string?> DeclineEventRequestAsync(Guid squadId, Guid ownerId, Guid eventId, Guid athleteId, CancellationToken ct);
    /// <summary>The event's participant roster for the member-facing event page — any signed-in athlete
    /// may see a published event's roster (owner also sees drafts). Null if not visible to the caller.</summary>
    Task<IReadOnlyList<SquadEventAttendee>?> ListParticipantsAsync(Guid squadId, Guid meId, Guid eventId, CancellationToken ct);
    /// <summary>The event's denormalized route geometry (JSON [[lat,lon],…]) for drawing the map on the
    /// event page — visible to anyone who can see the event, so a member needn't own the source course.
    /// Null if the event isn't visible to the caller or has no route.</summary>
    Task<string?> GetRouteAsync(Guid squadId, Guid meId, Guid eventId, CancellationToken ct);
    /// <summary>Cache the reverse-geocoded name of the event's route start (first-writer-wins: only set
    /// when currently empty). Allowed for any caller who can see the event — it's derived public data.
    /// Returns whether this call stored the value.</summary>
    Task<bool> SetStartPlaceAsync(Guid squadId, Guid meId, Guid eventId, string place, CancellationToken ct);
    /// <summary>Title/start/notes/place for building a PUBLISHED event's calendar (.ics) file. Needs no
    /// auth — the same details the shareable event page shows. Null if not found or unpublished.</summary>
    Task<EventCalendarInfo?> GetCalendarInfoAsync(Guid squadId, Guid eventId, CancellationToken ct);
    /// <summary>Delete an event if <paramref name="ownerId"/> owns its squad; false otherwise.</summary>
    Task<bool> DeleteAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    /// <summary>RSVP to an event. A member (or owner) of the event's squad joins instantly; a non-member's
    /// join becomes a pending request the coach approves. The result carries the event's squad/owner/title
    /// so the caller can notify the coach of a new request.</summary>
    Task<EventJoinResult> JoinAsync(Guid eventId, Guid meId, CancellationToken ct);
    Task<bool> LeaveAsync(Guid eventId, Guid meId, CancellationToken ct);
    /// <summary>Mark attendance. Only allowed on the calendar day of the event (in its own offset),
    /// and only for a member who has already joined.</summary>
    Task<CheckInOutcome> CheckInAsync(Guid eventId, Guid meId, CancellationToken ct);
    /// <summary>Undo a check-in — clears the caller's recorded attendance while keeping their RSVP.
    /// Idempotent: succeeds whether or not a check-in was present, as long as the RSVP exists.</summary>
    Task<bool> UndoCheckInAsync(Guid eventId, Guid meId, CancellationToken ct);
    /// <summary>The event's logo/banner blob name (kind = "logo" | "banner"), or null.</summary>
    Task<string?> GetImageBlobAsync(Guid squadId, Guid eventId, string kind, CancellationToken ct);
    /// <summary>Owner sets (or clears, when null) the event's logo/banner blob name. False if not owner.</summary>
    Task<bool> SetImageBlobAsync(Guid squadId, Guid eventId, string kind, string? blobName, Guid ownerId, CancellationToken ct);
}
