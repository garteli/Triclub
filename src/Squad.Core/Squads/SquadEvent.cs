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
    Guid? CourseId, string? CourseName, double? CourseKm, string? CoursePoints, string? Notes, DateTimeOffset CreatedUtc);

/// <summary>A squad event as seen by a member: the summary fields (no heavy points body) plus the
/// join/checked-in counts and this caller's own join + check-in state.</summary>
public sealed record SquadEventView(
    Guid Id, Guid SquadId, string Title, byte Sport, DateTimeOffset StartUtc,
    Guid? CourseId, string? CourseName, double? CourseKm, string? Notes,
    int JoinCount, int CheckedInCount, bool Joined, DateTimeOffset? CheckedInUtc);

/// <summary>Why a check-in was (or wasn't) accepted. <see cref="Ok"/> covers a fresh check-in and a
/// repeat of one already recorded (idempotent).</summary>
public enum CheckInOutcome { Ok, NotFound, NotJoined, NotToday }

/// <summary>Persists a squad's ad-hoc group sessions and the per-member RSVP + check-in.
/// Create/delete are guarded to the squad's owner (coach).</summary>
public interface ISquadEventStore
{
    /// <summary>Upcoming events for a squad, with the caller's own join/check-in state.</summary>
    Task<IReadOnlyList<SquadEventView>> ListForSquadAsync(Guid squadId, Guid meId, CancellationToken ct);
    /// <summary>The caller's joined upcoming events across every squad, soonest first.</summary>
    Task<IReadOnlyList<SquadEventView>> ListForMemberAsync(Guid meId, CancellationToken ct);
    Task<bool> IsOwnerAsync(Guid squadId, Guid ownerId, CancellationToken ct);
    /// <summary>Create an event if <paramref name="ownerId"/> owns the squad; null otherwise.</summary>
    Task<SquadEvent?> CreateAsync(
        Guid squadId, Guid ownerId, string title, byte sport, DateTimeOffset startUtc,
        Guid? courseId, string? courseName, double? courseKm, string? coursePoints, string? notes, CancellationToken ct);
    /// <summary>Delete an event if <paramref name="ownerId"/> owns its squad; false otherwise.</summary>
    Task<bool> DeleteAsync(Guid squadId, Guid ownerId, Guid eventId, CancellationToken ct);
    Task<bool> JoinAsync(Guid eventId, Guid meId, CancellationToken ct);
    Task<bool> LeaveAsync(Guid eventId, Guid meId, CancellationToken ct);
    /// <summary>Mark attendance. Only allowed on the calendar day of the event (in its own offset),
    /// and only for a member who has already joined.</summary>
    Task<CheckInOutcome> CheckInAsync(Guid eventId, Guid meId, CancellationToken ct);
}
