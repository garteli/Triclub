namespace Squad.Core;

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

    // Recording device — the head unit / phone that produced the file (from FIT
    // FileId/DeviceInfo, e.g. "Garmin Edge 1050"). Null when the source doesn't say.
    public string? DeviceName { get; init; }

    // Weather at the start location + time, enriched post-parse from Open-Meteo.
    // Null for indoor activities (no GPS) or when the lookup failed.
    public ActivityWeather? Weather { get; init; }

    // Provenance — critical for dedup.
    public ActivitySource Source { get; init; }
    public string? SourceExternalId { get; init; }   // Garmin activityId, HK uuid, ...
    public string Fingerprint { get; init; } = string.Empty;

    // The group event (SquadEvent) this ride was recorded for, when started from a scheduled
    // group ride. Null for ad-hoc activities. Lets a ride be listed under its event.
    public Guid? EventId { get; init; }

    // Detailed track + laps — stored compressed, hydrated only for the detail view.
    public IReadOnlyList<TrackPoint> Track { get; init; } = [];
    public IReadOnlyList<Lap> Laps { get; init; } = [];
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

/// <summary>One recorded lap (device auto-lap or manual press). Metrics are the lap's own
/// summary as the head unit computed them — not re-derived from the track.</summary>
public sealed record Lap(
    int OffsetSec,             // lap start, seconds from Activity.StartUtc
    double DurationSec,        // timer (moving) time for the lap
    double? DistanceMeters,
    double? AvgSpeedMps,
    double? AvgHeartRate,
    double? AvgPowerWatts,
    double? AvgCadence,
    double? ElevGainMeters);

/// <summary>The hydrated detail payload for one activity — the track and its laps. Persisted
/// as one gzipped blob; the read side returns both to the detail view in a single fetch.</summary>
public sealed record ActivityDetail(
    IReadOnlyList<TrackPoint> Track,
    IReadOnlyList<Lap> Laps);
