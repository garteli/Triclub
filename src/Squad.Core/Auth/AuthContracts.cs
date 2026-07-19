// Auth ports + DTOs. Kept in the single Squad.Core namespace so hosts/infra need
// only `using Squad.Core;`. The domain owns the shapes; Web issues/validates JWTs
// and verifies external id_tokens, Infrastructure persists accounts.
namespace Squad.Core;

/// <summary>The well-known squad self-service sign-ups join for the MVP (no Squad table yet).</summary>
public static class Squads
{
    public static readonly Guid Demo = new("11111111-1111-1111-1111-111111111111");
}

/// <summary>A persisted account row (== an Athlete). Password and/or a federated subject.</summary>
public sealed record AthleteAccount(
    Guid Id,
    string DisplayName,
    string Initials,
    string AvatarColor,
    Guid SquadId,
    string? Email,
    string? PasswordHash,
    string? GoogleSub,
    string? AppleSub);

/// <summary>How a new account is created (from password sign-up or first OAuth sign-in).</summary>
public sealed record NewAthleteAccount(
    Guid Id,
    string DisplayName,
    string Initials,
    string AvatarColor,
    Guid SquadId,
    string? Email,
    string? PasswordHash = null,
    string? GoogleSub = null,
    string? AppleSub = null);

/// <summary>Account persistence. Email is the login key; GoogleSub/AppleSub link federated identity.</summary>
public interface IAthleteAccounts
{
    Task<AthleteAccount?> FindByEmailAsync(string email, CancellationToken ct);
    Task<AthleteAccount?> FindByProviderAsync(ExternalProvider provider, string subject, CancellationToken ct);
    Task<AthleteAccount?> GetAsync(Guid id, CancellationToken ct);
    Task CreateAsync(NewAthleteAccount account, CancellationToken ct);
    /// <summary>Attach a federated subject to an existing (e.g. password) account matched by email.</summary>
    Task LinkProviderAsync(Guid id, ExternalProvider provider, string subject, CancellationToken ct);
}

public enum ExternalProvider { Google, Apple }

/// <summary>The signed-in athlete's editable profile (identity + training fields).</summary>
public sealed record ProfileDetail(
    Guid Id, string Name, string Initials, string AvatarColor, string? Email, Guid SquadId,
    string? Club, string? AgeGroup, string? PrimarySport, string? Level, int? Ftp, string? WeeklyHours, string? Bio);

/// <summary>A profile edit. Null fields are left unchanged; the host recomputes Initials if Name changes.</summary>
public sealed record ProfileUpdate(
    string? Name, string? Club, string? AgeGroup, string? PrimarySport, string? Level, int? Ftp, string? WeeklyHours, string? Bio);

/// <summary>Read/update the athlete's own profile.</summary>
public interface IProfileService
{
    Task<ProfileDetail?> GetAsync(Guid athleteId, CancellationToken ct);
    Task UpdateAsync(Guid athleteId, string? name, string? initials, ProfileUpdate fields, CancellationToken ct);
}

// ----- Squads / groups -----

/// <summary>A club as it appears in Discover / Group profile, with the caller's membership flag.</summary>
public sealed record SquadSummary(
    Guid Id, string Name, string Discipline, string? Location, string? Level, string Kind,
    string? Price, string? PerLabel, string Color, string? Rating, string? Description,
    int MemberCount, bool IsMember, Guid? OwnerId,
    // Caller's join-request state on a gated squad: none | pending | approved | declined.
    string RequestStatus = "none");

/// <summary>Fields for creating a squad (from the Register-a-group wizard).</summary>
public sealed record SquadCreate(
    string Name, string Discipline, string? Location, string? Level, string Kind,
    string? Price, string? PerLabel, string Color, string? Description);

public interface ISquadService
{
    Task<IReadOnlyList<SquadSummary>> ListAsync(Guid? me, CancellationToken ct);
    Task<SquadSummary?> GetAsync(Guid id, Guid? me, CancellationToken ct);
    /// <summary>Create a squad; the creator becomes owner + member and it becomes their active squad.</summary>
    Task<Guid> CreateAsync(SquadCreate squad, Guid ownerId, CancellationToken ct);
    /// <summary>Join a squad (idempotent) and make it the athlete's active squad.</summary>
    Task JoinAsync(Guid squadId, Guid athleteId, CancellationToken ct);

    /// <summary>Free squad → join immediately; gated squad → create a pending request (idempotent).</summary>
    Task<JoinOutcome> JoinOrRequestAsync(Guid squadId, string kind, Guid athleteId, CancellationToken ct);
    /// <summary>Pending join requests across all squads owned by this athlete.</summary>
    Task<IReadOnlyList<JoinRequestItem>> GetPendingRequestsForOwnerAsync(Guid ownerId, CancellationToken ct);
    /// <summary>Owner approves a request → membership; returns the applicant's name (null if not owner / no request).</summary>
    Task<string?> ApproveRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct);
    /// <summary>Owner declines a request; returns the applicant's name (null if not owner / no request).</summary>
    Task<string?> DeclineRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct);
}

public enum JoinOutcome { Joined, Requested, AlreadyMember, AlreadyRequested }

/// <summary>A pending applicant for one of the owner's squads (list + review).</summary>
public sealed record JoinRequestItem(
    Guid SquadId, string SquadName, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    int? Ftp, string? WeeklyHours, DateTimeOffset CreatedUtc);

// ----- Squad chat -----

/// <summary>A squad chat message enriched with the sender's display fields.</summary>
public sealed record ChatMessage(
    Guid Id, Guid SquadId, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    string Body, DateTimeOffset CreatedUtc);

public interface IChatService
{
    Task<IReadOnlyList<ChatMessage>> GetRecentAsync(Guid squadId, int take, CancellationToken ct);
    /// <summary>Persist a message and return it enriched with sender display fields.</summary>
    Task<ChatMessage?> PostAsync(Guid squadId, Guid athleteId, string body, CancellationToken ct);
}

// ----- Follow -----

public interface IFollowService
{
    Task FollowAsync(Guid followerId, Guid followeeId, CancellationToken ct);
    Task UnfollowAsync(Guid followerId, Guid followeeId, CancellationToken ct);
    Task<bool> IsFollowingAsync(Guid followerId, Guid followeeId, CancellationToken ct);
}

// ----- Notifications -----

public sealed record Notification(
    Guid Id, Guid RecipientId, string Kind, Guid? ActorId, string ActorName, string Text, bool Read, DateTimeOffset CreatedUtc);

public interface INotificationService
{
    Task AddAsync(Guid recipientId, string kind, Guid? actorId, string actorName, string text, CancellationToken ct);
    Task<IReadOnlyList<Notification>> GetRecentAsync(Guid recipientId, int take, CancellationToken ct);
    Task MarkAllReadAsync(Guid recipientId, CancellationToken ct);
}

// ----- Training plan -----

/// <summary>One planned workout on a date (a row in the weekly plan).</summary>
public sealed record PlannedWorkoutRow(
    Guid Id, DateTime WorkoutDate, string Discipline, string Title, string? Sub, int DurationMin, int Load);

public interface IPlanService
{
    /// <summary>The athlete's plan for the Monday..Sunday week containing <paramref name="weekStart"/>,
    /// seeding a template week the first time it's requested.</summary>
    Task<IReadOnlyList<PlannedWorkoutRow>> GetWeekAsync(Guid athleteId, DateTime weekStart, CancellationToken ct);
}

/// <summary>Result of verifying a provider id_token: the identity, or a diagnostic error reason.</summary>
public sealed record ExternalVerifyResult(ExternalIdentity? Identity, string? Error);

/// <summary>Verifies a provider id_token and returns its trustworthy claims (or a failure reason).</summary>
public interface IExternalTokenVerifier
{
    ExternalProvider Provider { get; }
    Task<ExternalVerifyResult> VerifyAsync(string idToken, CancellationToken ct);
}

/// <summary>The claims we trust from a verified provider id_token.</summary>
public sealed record ExternalIdentity(string Subject, string? Email, string? Name, bool EmailVerified);

/// <summary>Mints the app's own JWT bearer for an authenticated athlete.</summary>
public interface ITokenIssuer
{
    /// <summary>Returns (token, expiresUtc). 'sub'/NameIdentifier = athlete id.</summary>
    (string token, DateTimeOffset expiresUtc) Issue(AthleteAccount account);
}

// ----- request/response DTOs (the JSON the client exchanges) -----

public sealed record RegisterRequest(string Name, string Email, string Password);
public sealed record LoginRequest(string Email, string Password);
public sealed record ExternalLoginRequest(string IdToken);

/// <summary>What the client stores as its session after any successful auth.</summary>
public sealed record AuthResult(
    string Token,
    DateTimeOffset ExpiresUtc,
    Guid AthleteId,
    string Name,
    string Initials,
    string AvatarColor,
    string? Email,
    Guid SquadId,
    string Provider);
