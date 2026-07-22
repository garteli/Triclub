// Auth ports + DTOs. Kept in the single Squad.Core namespace so hosts/infra need
// only `using Squad.Core;`. The domain owns the shapes; Web issues/validates JWTs
// and verifies external id_tokens, Infrastructure persists accounts.
namespace Squad.Core;

/// <summary>The well-known landing squad self-service sign-ups join — the club
/// "מרוץ העצבים". Seeded by Squads.sql so its feed/leaderboard/roster exist.</summary>
public static class Squads
{
    public static readonly Guid Landing = new("c1a5b000-0000-0000-0000-000000000001");
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
    string? Club, string? AgeGroup, string? PrimarySport, string? Level, int? Ftp, string? WeeklyHours, string? Bio,
    // BirthDate is an ISO 'yyyy-MM-dd' string; AgeGroup is derived from it on the client.
    string? BirthDate = null, string? Gender = null, decimal? WeightKg = null,
    // Proxy path to the athlete's avatar photo (null when they have none → initials).
    string? AvatarUrl = null);

/// <summary>A profile edit. Null fields are left unchanged; the host recomputes Initials if Name changes.</summary>
public sealed record ProfileUpdate(
    string? Name, string? Club, string? AgeGroup, string? PrimarySport, string? Level, int? Ftp, string? WeeklyHours, string? Bio,
    string? BirthDate = null, string? Gender = null, decimal? WeightKg = null);

/// <summary>Read/update the athlete's own profile.</summary>
public interface IProfileService
{
    Task<ProfileDetail?> GetAsync(Guid athleteId, CancellationToken ct);
    Task UpdateAsync(Guid athleteId, string? name, string? initials, ProfileUpdate fields, CancellationToken ct);

    /// <summary>The athlete's current avatar blob name, or null if they have no photo.</summary>
    Task<string?> GetAvatarBlobAsync(Guid athleteId, CancellationToken ct);
    /// <summary>Set (or clear, when null) the athlete's avatar blob name.</summary>
    Task SetAvatarBlobAsync(Guid athleteId, string? blobName, CancellationToken ct);
}

// ----- Squads / groups -----

/// <summary>A club as it appears in Discover / Group profile, with the caller's membership flag.</summary>
public sealed record SquadSummary(
    Guid Id, string Name, string Discipline, string? Location, string? Level, string Kind,
    string? Price, string? PerLabel, string Color, string? Rating, string? Description,
    int MemberCount, bool IsMember, Guid? OwnerId,
    // Caller's join-request state on a gated squad: none | pending | approved | declined.
    string RequestStatus = "none",
    // Proxy paths to the club's logo / banner images (null when unset → gradient fallback).
    string? LogoUrl = null, string? BannerUrl = null);

/// <summary>Fields for creating a squad (from the Register-a-group wizard).</summary>
public sealed record SquadCreate(
    string Name, string Discipline, string? Location, string? Level, string Kind,
    string? Price, string? PerLabel, string Color, string? Description);

/// <summary>An owner's edit to a squad's details / pricing. Null fields are left unchanged.</summary>
public sealed record SquadUpdate(
    string? Name, string? Discipline, string? Location, string? Level, string? Kind,
    string? Price, string? PerLabel, string? Color, string? Description);

/// <summary>One roster member as the owner sees it in the manage-group screen.</summary>
public sealed record SquadMember(
    Guid AthleteId, string Name, string Initials, string AvatarColor, string Role,
    DateTimeOffset JoinedUtc, string? AvatarUrl = null);

/// <summary>Result of an owner adding a member by email.</summary>
public enum AddMemberOutcome { Added, AlreadyMember, AthleteNotFound, NotOwner }

/// <summary>Body for the owner's "add member by email" call.</summary>
public sealed record AddMemberRequest(string Email);

/// <summary>Body for the owner's "create invite link" call. Reset=true rotates the link.</summary>
public sealed record InviteCreateRequest(bool Reset = false);

/// <summary>Public view of a squad invite link — shown to the invitee (who may not be signed in yet)
/// so they know which club they're about to join.</summary>
public sealed record InviteInfo(
    string Token, Guid SquadId, string SquadName, string Discipline, string Color,
    int MemberCount, string? LogoUrl);

public enum AcceptInviteOutcome { Joined, AlreadyMember }

/// <summary>Result of accepting an invite: what happened, which squad (for navigation), and the
/// owner id so the caller can notify them of a genuinely-new member.</summary>
public sealed record AcceptInviteResult(AcceptInviteOutcome Outcome, Guid SquadId, string SquadName, Guid? OwnerId);

public interface ISquadService
{
    Task<IReadOnlyList<SquadSummary>> ListAsync(Guid? me, CancellationToken ct);
    Task<SquadSummary?> GetAsync(Guid id, Guid? me, CancellationToken ct);
    /// <summary>Create a squad; the creator becomes owner + member and it becomes their active squad.</summary>
    Task<Guid> CreateAsync(SquadCreate squad, Guid ownerId, CancellationToken ct);
    /// <summary>Join a squad (idempotent) and make it the athlete's active squad.</summary>
    Task JoinAsync(Guid squadId, Guid athleteId, CancellationToken ct);

    /// <summary>Switch the athlete's active squad to one they already belong to (the feed /
    /// leaderboard / activities follow). Returns false if they're not a member of it.</summary>
    Task<bool> SetActiveSquadAsync(Guid squadId, Guid athleteId, CancellationToken ct);

    /// <summary>Free squad → join immediately; gated squad → create a pending request (idempotent).</summary>
    Task<JoinOutcome> JoinOrRequestAsync(Guid squadId, string kind, Guid athleteId, CancellationToken ct);
    /// <summary>Pending join requests across all squads owned by this athlete.</summary>
    Task<IReadOnlyList<JoinRequestItem>> GetPendingRequestsForOwnerAsync(Guid ownerId, CancellationToken ct);
    /// <summary>Owner approves a request → membership; returns the applicant's name (null if not owner / no request).</summary>
    Task<string?> ApproveRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct);
    /// <summary>Owner declines a request; returns the applicant's name (null if not owner / no request).</summary>
    Task<string?> DeclineRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct);

    // ----- owner management: details/pricing, roster, images -----

    /// <summary>Owner edits the squad's details / pricing. Returns false if the caller doesn't own it.</summary>
    Task<bool> UpdateAsync(Guid squadId, Guid ownerId, SquadUpdate fields, CancellationToken ct);
    /// <summary>The squad's roster (owner-only). Null if the caller doesn't own it.</summary>
    Task<IReadOnlyList<SquadMember>?> GetMembersAsync(Guid squadId, Guid ownerId, CancellationToken ct);
    /// <summary>Owner adds a registered athlete (by email) to the roster.</summary>
    Task<AddMemberOutcome> AddMemberByEmailAsync(Guid squadId, string email, Guid ownerId, CancellationToken ct);
    /// <summary>Owner removes a member. Returns false if not owner, or the target is the owner / not a member.</summary>
    Task<bool> RemoveMemberAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct);

    // ----- invite links (coach invites friends to join their group) -----------

    /// <summary>Owner creates a shareable invite token (or returns the squad's existing active one).
    /// Anyone who signs up / accepts with it joins the squad immediately, bypassing gating.
    /// <paramref name="reset"/> revokes the current link and mints a fresh one. Null if not owner.</summary>
    Task<string?> CreateInviteAsync(Guid squadId, Guid ownerId, bool reset, CancellationToken ct);
    /// <summary>Public lookup of a non-revoked invite token → the squad it joins (null if unknown/revoked).</summary>
    Task<InviteInfo?> GetInviteAsync(string token, CancellationToken ct);
    /// <summary>Accept an invite: join the squad immediately (idempotent) and make it the athlete's
    /// active squad. Null if the token is unknown or revoked.</summary>
    Task<AcceptInviteResult?> AcceptInviteAsync(string token, Guid athleteId, CancellationToken ct);

    /// <summary>The blob name of the squad's logo/banner image (kind = "logo" | "banner"), or null.</summary>
    Task<string?> GetImageBlobAsync(Guid squadId, string kind, CancellationToken ct);
    /// <summary>Owner sets (or clears, when null) the squad's logo/banner blob name. False if not owner.</summary>
    Task<bool> SetImageBlobAsync(Guid squadId, string kind, string? blobName, Guid ownerId, CancellationToken ct);
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
    Task MarkReadAsync(Guid recipientId, Guid notificationId, CancellationToken ct);
    Task MarkAllReadAsync(Guid recipientId, CancellationToken ct);
}

// ----- Training plan -----

/// <summary>One planned workout on a date (a row in the weekly plan). <see cref="CourseName"/>/
/// <see cref="CoursePoints"/> (JSON [[lat,lon],…]) are set when a coach attached a route to follow.</summary>
public sealed record PlannedWorkoutRow(
    Guid Id, DateTime WorkoutDate, string Discipline, string Title, string? Sub, int DurationMin, int Load,
    string? CourseName, string? CoursePoints);

/// <summary>A workout a coach is publishing onto an athlete's calendar (no id/athlete yet — the
/// service fans it out to each assigned athlete on the given date). The optional course route is
/// embedded (<see cref="CoursePoints"/> = JSON [[lat,lon],…]) so athletes need no access to the
/// coach's owner-scoped Course.</summary>
public sealed record PlannedWorkoutWrite(
    DateTime Date, string Discipline, string Title, string? Sub, int DurationMin, int Load,
    string? CourseName, string? CoursePoints);

/// <summary>A coach's saved plan in list form (no doc body).</summary>
public sealed record CoachPlanSummary(Guid Id, string Name, DateTimeOffset UpdatedUtc);

/// <summary>A coach's saved plan with its full JSON doc.</summary>
public sealed record CoachPlanDoc(Guid Id, string Name, string Doc, DateTimeOffset UpdatedUtc);

/// <summary>A plan an athlete currently has on their calendar (grouped from PlannedWorkout by PlanId),
/// so they can see and remove it.</summary>
public sealed record AthletePlanSummary(
    Guid PlanId, string PlanName, DateTime FirstDate, DateTime LastDate, int Sessions);

public interface IPlanService
{
    /// <summary>The athlete's plan for the Monday..Sunday week containing <paramref name="weekStart"/>,
    /// seeding a template week the first time it's requested.</summary>
    Task<IReadOnlyList<PlannedWorkoutRow>> GetWeekAsync(Guid athleteId, DateTime weekStart, CancellationToken ct);

    /// <summary>Every planned workout in the inclusive [start..end] date range (used by the month
    /// calendar to dot the whole visible month, including the weeks ahead).</summary>
    Task<IReadOnlyList<PlannedWorkoutRow>> GetRangeAsync(Guid athleteId, DateTime start, DateTime end, CancellationToken ct);

    /// <summary>Publish a coach's plan (whole plan or a single week — the caller sets the span):
    /// replace each assigned athlete's PlannedWorkout rows in [spanStart..spanEnd] with
    /// <paramref name="workouts"/>, stamped with <paramref name="planId"/>/<paramref name="planName"/> so
    /// the plan can later be unpublished or removed. Only athletes who are members of a squad OWNED by
    /// <paramref name="coachId"/> are written. Returns the ids of the athletes who got the plan
    /// (so the caller can notify exactly them).</summary>
    Task<IReadOnlyList<Guid>> PublishAsync(Guid coachId, Guid planId, string planName, IReadOnlyList<Guid> athleteIds,
        DateTime spanStart, DateTime spanEnd, IReadOnlyList<PlannedWorkoutWrite> workouts, CancellationToken ct);

    /// <summary>Unpublish a plan the coach owns: remove every athlete's PlannedWorkout rows stamped with
    /// <paramref name="planId"/>. Returns how many rows were removed (0 if not owned / nothing published).</summary>
    Task<int> UnpublishAsync(Guid coachId, Guid planId, CancellationToken ct);

    /// <summary>The plans an athlete currently has on their calendar (grouped by PlanId).</summary>
    Task<IReadOnlyList<AthletePlanSummary>> ListAthletePlansAsync(Guid athleteId, CancellationToken ct);

    /// <summary>An athlete removes a plan from their OWN calendar (deletes only their rows for that PlanId).</summary>
    Task<int> RemoveAthletePlanAsync(Guid athleteId, Guid planId, CancellationToken ct);

    // ----- a coach's saved plans (their own working copies) -----
    /// <summary>List a coach's saved plans, most-recently-updated first.</summary>
    Task<IReadOnlyList<CoachPlanSummary>> ListPlansAsync(Guid ownerId, CancellationToken ct);
    /// <summary>Load one plan the coach owns (null if not found / not theirs).</summary>
    Task<CoachPlanDoc?> GetPlanAsync(Guid ownerId, Guid planId, CancellationToken ct);
    /// <summary>Create (planId null) or update a plan the coach owns; returns its id (null if the
    /// update targets a plan they don't own).</summary>
    Task<Guid?> SavePlanAsync(Guid ownerId, Guid? planId, string name, string doc, Guid? squadId, CancellationToken ct);
    /// <summary>Delete a plan the coach owns; returns whether a row was removed.</summary>
    Task<bool> DeletePlanAsync(Guid ownerId, Guid planId, CancellationToken ct);
}

// ----- AI plan import (PDF → CoachPlan doc) -----

/// <summary>Outcome of importing a PDF training plan. On success <see cref="Doc"/> is a JSON string
/// in the CoachPlan editor's schema and <see cref="Name"/> is the plan's title; on failure
/// <see cref="Error"/> explains why (unconfigured, unreadable PDF, model error, …).</summary>
public sealed record PlanImportResult(bool Ok, string? Doc, string? Name, string? Error)
{
    public static PlanImportResult Success(string doc, string name) => new(true, doc, name, null);
    public static PlanImportResult Fail(string error) => new(false, null, null, error);
}

/// <summary>Generates training plans via an AI model (used by the plan-library seeder).
/// <see cref="Configured"/> is false when no provider/API key is set.</summary>
public interface IPlanImportService
{
    bool Configured { get; }

    /// <summary>Generate a plan from a catalog spec — a text prompt to the model, normalised into the
    /// CoachPlan doc shape. Used by the library seeder to build reusable templates.</summary>
    Task<PlanImportResult> GeneratePlanAsync(PlanSpec spec, CancellationToken ct);
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
    string Provider,
    // True for sysadmin accounts — the client shows the System-admin console entry.
    bool IsAdmin = false);
