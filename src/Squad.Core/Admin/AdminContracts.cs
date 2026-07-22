// Sysadmin surface — read + moderate every user and club. Gated in the Web host to a
// small allowlist of sysadmin emails (see AdminRegistry); the service itself is trusting
// (the caller has already been authorised). Reuses SquadMember (AuthContracts) for rosters.
namespace Squad.Core;

/// <summary>Aggregate counts for the sysadmin dashboard header.</summary>
public sealed record AdminOverview(int Users, int Clubs, int PersonalSquads, int Activities);

/// <summary>One athlete row in the sysadmin user list.</summary>
public sealed record AdminUserRow(
    Guid Id, string Name, string? Email, string Initials, string AvatarColor,
    Guid ActiveSquadId, string? ActiveSquadName, int Memberships, int Activities,
    // True when the athlete owns a real club (a non-personal squad) — such a user can't be
    // deleted until the club is dealt with, so the UI can explain why.
    bool OwnsClub, string? AvatarUrl);

/// <summary>One squad row in the sysadmin group list (includes the per-athlete personal squads).</summary>
public sealed record AdminSquadRow(
    Guid Id, string Name, string Discipline, string Kind, string Color, string? Location,
    int MemberCount, Guid? OwnerId, string? OwnerName, DateTimeOffset CreatedUtc, string? LogoUrl);

/// <summary>Outcome of a destructive sysadmin action.</summary>
public enum AdminOutcome
{
    Ok,
    NotFound,
    /// <summary>The target is protected (a personal squad, the landing club, or a group owner).</summary>
    Protected,
    /// <summary>The user owns a real club and must be handled (delete/transfer) before deletion.</summary>
    OwnsClub,
}

public sealed record AdminActionResult(AdminOutcome Outcome, string? Message = null);

/// <summary>Sysadmin operations over users and clubs. Authorisation is enforced by the host.</summary>
public interface ISysAdminService
{
    Task<AdminOverview> GetOverviewAsync(CancellationToken ct);
    Task<IReadOnlyList<AdminUserRow>> ListUsersAsync(string? search, CancellationToken ct);
    Task<IReadOnlyList<AdminSquadRow>> ListSquadsAsync(CancellationToken ct);

    /// <summary>A squad's roster. Null when the squad doesn't exist.</summary>
    Task<IReadOnlyList<SquadMember>?> GetMembersAsync(Guid squadId, CancellationToken ct);

    /// <summary>Delete a club and its dependent rows, moving any member whose active squad was this
    /// one back to their own private squad. Personal squads and the landing club are protected.</summary>
    Task<AdminActionResult> DeleteSquadAsync(Guid squadId, CancellationToken ct);

    /// <summary>Remove a member (never the owner) from a squad, moving their active squad back to
    /// their private squad if it was this one.</summary>
    Task<AdminActionResult> RemoveMemberAsync(Guid squadId, Guid athleteId, CancellationToken ct);

    /// <summary>Delete a user account and everything they own (activities, memberships, their private
    /// squad, …). Blocked (OwnsClub) if they own a real club — that must be deleted/transferred first.</summary>
    Task<AdminActionResult> DeleteUserAsync(Guid athleteId, CancellationToken ct);
}
