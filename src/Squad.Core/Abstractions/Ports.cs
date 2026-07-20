// Ports the domain defines and the infrastructure/host implement. All in the single
// Squad.Core namespace so consumers need only `using Squad.Core;`.
namespace Squad.Core;

/// <summary>Every collection surface implements exactly this. New source = new class.</summary>
public interface ISourceAdapter
{
    ActivitySource Source { get; }
    Task<Activity> NormalizeAsync(RawActivity raw, CancellationToken ct);
}

public interface IRawActivityStore
{
    /// <summary>Persist the raw payload. False if (Source, SourceExternalId) already exists (idempotent no-op).</summary>
    Task<bool> TrySaveAsync(RawActivity raw, CancellationToken ct);
    Task<RawActivity?> GetAsync(Guid id, CancellationToken ct);
}

public enum UpsertOutcome { Inserted, Replaced, DiscardedDuplicate }

public interface IActivityRepository
{
    Task<UpsertOutcome> UpsertByFingerprintAsync(Activity activity, int sourceRank, CancellationToken ct);
}

/// <summary>Hand-off from the intake endpoint to the background ingest worker.</summary>
public interface IIngestQueue
{
    ValueTask EnqueueAsync(Guid rawActivityId, CancellationToken ct = default);
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct);
}

/// <summary>Post-commit fan-out (leaderboard aggregates + live feed push).</summary>
public interface IActivityFanout
{
    Task OnActivityCommittedAsync(Activity activity, CancellationToken ct);
}

public sealed record AthleteProfile(Guid Id, string Name, string Initials, string AvatarColor, Guid SquadId);

public interface IAthleteDirectory
{
    Task<AthleteProfile?> GetAsync(Guid athleteId, CancellationToken ct);
}

public interface ILeaderboardService
{
    Task<IReadOnlyList<LeaderboardRow>> GetWeeklyAsync(Guid squadId, Guid? me, DateTimeOffset asOf, CancellationToken ct);
}

/// <summary>Recent committed activities for a squad — the initial feed load the hub then tops up live.</summary>
public interface IFeedReadService
{
    Task<IReadOnlyList<FeedActivityRow>> GetRecentAsync(Guid squadId, int take, CancellationToken ct);
}

/// <summary>Raw joined row (Activity + Athlete display) the host maps into an ActivityFeedItem.</summary>
public sealed record FeedActivityRow(
    Guid Id, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    int Sport, DateTimeOffset StartUtc, int MovingTimeSec,
    double? DistanceMeters, double? TrainingLoad, double? AvgHeartRate);

/// <summary>Recent activities for a squad — the Activities list (with full summary metrics for the detail view).</summary>
public interface IActivityReadService
{
    Task<IReadOnlyList<ActivitySummaryRow>> GetForSquadAsync(Guid squadId, int take, CancellationToken ct);

    /// <summary>Delete one of the caller's OWN activities (scoped to the owner) plus its raw
    /// payload, so the same source workout can be re-imported later. True if a row was removed.</summary>
    Task<bool> DeleteAsync(Guid activityId, Guid athleteId, CancellationToken ct);
}

/// <summary>An activity summary joined to athlete display fields; drives both the list card and the detail metrics.</summary>
public sealed record ActivitySummaryRow(
    Guid Id, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    int Sport, DateTimeOffset StartUtc, int MovingTimeSec, int ElapsedTimeSec,
    double? DistanceMeters, double? ElevationGainM, double? AvgHeartRate,
    double? AvgPowerWatts, double? TrainingLoad, double? Calories);

/// <summary>Last-known live-ride position per rider. In-memory/single-instance; Redis to scale out.</summary>
public interface IRideSessionState
{
    void Upsert(Guid rideId, RiderUpdate update);
    bool TryGet(Guid rideId, Guid athleteId, out RiderUpdate? update);
    void Remove(Guid rideId, Guid athleteId);
    IReadOnlyCollection<RiderUpdate> Snapshot(Guid rideId);
}
