namespace Squad.Core;

// ----- Activity interactions: kudos + comments -----
// Strava-style social layer over a committed activity. Both are squad-scoped: an
// athlete can only react to / comment on activities owned by a member of their squad.

/// <summary>An activity's kudos state for one caller: total count + whether they've kudoed it.</summary>
public sealed record KudosState(int Count, bool Kudoed);

/// <summary>A comment on an activity, enriched with the author's display fields (rendered directly).</summary>
public sealed record ActivityComment(
    Guid Id, Guid ActivityId, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    string Body, DateTimeOffset CreatedUtc,
    // Proxy path to the author's avatar photo (null when they have none → initials).
    string? AvatarUrl = null);

/// <summary>Give/remove kudos on a squad activity. Returns null when the activity isn't visible
/// in the caller's squad; otherwise the fresh count + whether the caller now has kudos on it.</summary>
public interface IKudosService
{
    Task<KudosState?> SetAsync(Guid activityId, Guid squadId, Guid athleteId, bool give, CancellationToken ct);
}

/// <summary>Read/post comments on a squad activity. A null result means the activity isn't
/// visible in the caller's squad (never a member's activity → 404 at the edge).</summary>
public interface ICommentService
{
    Task<IReadOnlyList<ActivityComment>?> GetAsync(Guid activityId, Guid squadId, int take, CancellationToken ct);
    /// <summary>Persist a comment and return it enriched with the author's display fields.</summary>
    Task<ActivityComment?> PostAsync(Guid activityId, Guid squadId, Guid athleteId, string body, CancellationToken ct);
}
