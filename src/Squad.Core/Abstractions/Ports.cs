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

/// <summary>Last-known live-ride position per rider. In-memory/single-instance; Redis to scale out.</summary>
public interface IRideSessionState
{
    void Upsert(Guid rideId, RiderUpdate update);
    bool TryGet(Guid rideId, Guid athleteId, out RiderUpdate? update);
    void Remove(Guid rideId, Guid athleteId);
    IReadOnlyCollection<RiderUpdate> Snapshot(Guid rideId);
}
