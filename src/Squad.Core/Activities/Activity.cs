namespace Squad.Core.Activities;

/// <summary>
/// The canonical activity. Every collection surface normalizes to exactly this
/// shape via an <see cref="ISourceAdapter"/>; everything downstream (feed,
/// leaderboard, AI insights, map replay) reads only this and never knows where
/// the data came from.
/// </summary>
public sealed record Activity
{
    public Guid Id { get; init; }
    public Guid AthleteId { get; init; }

    public ActivitySport Sport { get; init; }
    public DateTimeOffset StartUtc { get; init; }
    public TimeSpan MovingTime { get; init; }
    public TimeSpan ElapsedTime { get; init; }

    // Summary metrics — what leaderboards & feed read. Null = not captured.
    public double? DistanceMeters { get; init; }
    public double? ElevationGainMeters { get; init; }
    public double? AvgHeartRate { get; init; }
    public double? MaxHeartRate { get; init; }
    public double? AvgPowerWatts { get; init; }
    public double? AvgCadence { get; init; }
    public double? Calories { get; init; }
    public double? TrainingLoad { get; init; }   // TSS-style; see TrainingLoad.cs

    // Provenance — critical for dedup.
    public ActivitySource Source { get; init; }
    public string? SourceExternalId { get; init; }   // Garmin activityId, HK uuid, ...
    public string Fingerprint { get; init; } = string.Empty;

    // Detailed track — stored compressed, hydrated only for map replay.
    public IReadOnlyList<TrackPoint> Track { get; init; } = [];
}

/// <summary>A single sample along the recorded track.</summary>
public sealed record TrackPoint(
    double Lat,
    double Lon,
    double? ElevM,
    int OffsetSec,            // seconds from Activity.StartUtc
    double? HeartRate,
    double? PowerW,
    double? Cadence,
    double? SpeedMps);
