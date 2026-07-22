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
    int JoinCount, int CheckedInCount, bool Joined, DateTimeOffset? CheckedInUtc, bool Published);

/// <summary>One member's attendance on an event, for the coach's joins/check-ins roster:
/// who joined, when, and whether (and when) they checked in.</summary>
public sealed record SquadEventAttendee(
    Guid AthleteId, string Name, string Initials, string AvatarColor,
    DateTimeOffset JoinedUtc, DateTimeOffset? CheckedInUtc, string? AvatarUrl);

/// <summary>Why a check-in was (or wasn't) accepted. <see cref="Ok"/> covers a fresh check-in and a
/// repeat of one already recorded (idempotent).</summary>
public enum CheckInOutcome { Ok, NotFound, NotJoined, NotToday }

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
    /// <summary>The full join/check-in roster for an event — owner-only; null if the caller isn't the owner.</summary>
    Task<IReadOnlyList<SquadEventAttendee>?> ListAttendeesAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    /// <summary>Delete an event if <paramref name="ownerId"/> owns its squad; false otherwise.</summary>
    Task<bool> DeleteAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    Task<bool> JoinAsync(Guid eventId, Guid meId, CancellationToken ct);
    Task<bool> LeaveAsync(Guid eventId, Guid meId, CancellationToken ct);
    /// <summary>Mark attendance. Only allowed on the calendar day of the event (in its own offset),
    /// and only for a member who has already joined.</summary>
    Task<CheckInOutcome> CheckInAsync(Guid eventId, Guid meId, CancellationToken ct);
}
