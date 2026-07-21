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

// AvatarUrl: proxy path to the athlete's avatar photo (null when they have none → initials).
public sealed record AthleteProfile(
    Guid Id, string Name, string Initials, string AvatarColor, Guid SquadId, string? AvatarUrl = null);

public interface IAthleteDirectory
{
    Task<AthleteProfile?> GetAsync(Guid athleteId, CancellationToken ct);
}

public interface ILeaderboardService
{
    Task<IReadOnlyList<LeaderboardRow>> GetWeeklyAsync(Guid squadId, Guid? me, DateTimeOffset asOf, CancellationToken ct);
}

/// <summary>Ranks every club (squad with members) against each other for the current week.
/// <paramref name="me"/> is the caller, so the row for their active club is flagged You.</summary>
public interface IClubRankingService
{
    Task<IReadOnlyList<ClubRankingRow>> GetWeeklyAsync(Guid? me, DateTimeOffset asOf, CancellationToken ct);
}

/// <summary>Recent committed activities for a squad — the initial feed load the hub then tops up live.
/// <paramref name="me"/> is the caller, so each row can report whether they've kudoed it.</summary>
public interface IFeedReadService
{
    Task<IReadOnlyList<FeedActivityRow>> GetRecentAsync(Guid squadId, Guid me, int take, CancellationToken ct);
}

/// <summary>Raw joined row (Activity + Athlete display) the host maps into an ActivityFeedItem.
/// Kudos/Comments are counts; IKudoed is whether the requesting caller has kudoed this activity.</summary>
public sealed record FeedActivityRow(
    Guid Id, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    int Sport, DateTimeOffset StartUtc, int MovingTimeSec,
    double? DistanceMeters, double? TrainingLoad, double? AvgHeartRate,
    // Proxy path to the athlete's avatar photo (null when they have none → initials).
    string? AvatarUrl = null,
    int Kudos = 0, int Comments = 0, bool IKudoed = false);

/// <summary>Recent activities for a squad — the Activities list (with full summary metrics for the detail view).</summary>
public interface IActivityReadService
{
    Task<IReadOnlyList<ActivitySummaryRow>> GetForSquadAsync(Guid squadId, Guid me, int take, CancellationToken ct);

    /// <summary>Delete one of the caller's OWN activities (scoped to the owner) plus its raw
    /// payload, so the same source workout can be re-imported later. True if a row was removed.</summary>
    Task<bool> DeleteAsync(Guid activityId, Guid athleteId, CancellationToken ct);

    /// <summary>The decompressed detail (GPS/sensor track + laps) for one activity, visible only
    /// within the given squad. Null when the activity isn't in that squad or has no stored detail
    /// (e.g. an indoor session with no GPS). Hydrated on demand — it's the heavy blob the list omits.</summary>
    Task<ActivityDetail?> GetDetailAsync(Guid activityId, Guid squadId, CancellationToken ct);

    /// <summary>Other athletes in the caller's squad who recorded a ride at the same place and
    /// time — a proxy for "rode together". Same sport, start within a short window and a short
    /// distance of this activity's start point. Empty when the activity has no GPS start point
    /// or isn't visible to the caller's squad.</summary>
    Task<IReadOnlyList<MatchedRide>> GetMatchedRidesAsync(Guid activityId, Guid squadId, CancellationToken ct);
}

/// <summary>An activity summary joined to athlete display fields; drives both the list card and the detail metrics.</summary>
public sealed record ActivitySummaryRow(
    Guid Id, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    int Sport, DateTimeOffset StartUtc, int MovingTimeSec, int ElapsedTimeSec,
    double? DistanceMeters, double? ElevationGainM, double? AvgHeartRate,
    double? AvgPowerWatts, double? TrainingLoad, double? Calories,
    // Proxy path to the athlete's avatar photo (null when they have none → initials).
    string? AvatarUrl = null,
    // Kudos/Comments are counts; IKudoed is whether the requesting caller has kudoed this activity.
    int Kudos = 0, int Comments = 0, bool IKudoed = false,
    // Recording device name (FIT) and weather-at-start JSON (ActivityWeather). Null when unknown;
    // the host deserializes WeatherJson before sending it to the client.
    string? DeviceName = null, string? WeatherJson = null);

/// <summary>A teammate's ride that overlapped this one in place + time (the "rode together" set).</summary>
public sealed record MatchedRide(
    Guid ActivityId, Guid AthleteId, string AthleteName, string Initials, string AvatarColor,
    double? DistanceMeters, int MovingTimeSec, double? AvgHeartRate,
    // Proxy path to the athlete's avatar photo (null when they have none → initials).
    string? AvatarUrl = null);

/// <summary>Last-known live-ride position per rider. In-memory/single-instance; Redis to scale out.</summary>
public interface IRideSessionState
{
    void Upsert(Guid rideId, RiderUpdate update);
    bool TryGet(Guid rideId, Guid athleteId, out RiderUpdate? update);
    void Remove(Guid rideId, Guid athleteId);
    IReadOnlyCollection<RiderUpdate> Snapshot(Guid rideId);

    // Phone-to-phone BLE ranges, keyed by (observer, peer) so the newest range for each
    // ordered pair overwrites the last. A future pack-position fusion pass reads these.
    void RecordPeerRange(Guid rideId, PeerRangeObservation obs);
    IReadOnlyCollection<PeerRangeObservation> PeerRanges(Guid rideId);
}
