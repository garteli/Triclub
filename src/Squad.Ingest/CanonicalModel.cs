// ===========================================================================
//  CanonicalModel.cs
//  These types were defined in STEP 1 of the ingest spec. They are reproduced
//  here verbatim so this slice compiles standalone. If they already live in
//  your solution, DELETE this file and keep your originals — do not duplicate.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Ingest;

public enum ActivitySport : byte { Other = 0, Swim = 1, Bike = 2, Run = 3 }

// Ordering here is arbitrary; SourceRank (Fingerprint.cs) encodes the priority.
public enum ActivitySource : byte { FitUpload = 1, HealthKit = 2, HealthConnect = 3, Garmin = 4 }

/// <summary>The one model everything downstream reads. Source-blind by design.</summary>
public sealed record Activity
{
    public Guid Id { get; init; }
    public Guid AthleteId { get; init; }

    public ActivitySport Sport { get; init; }
    public DateTimeOffset StartUtc { get; init; }
    public TimeSpan MovingTime { get; init; }
    public TimeSpan ElapsedTime { get; init; }

    // Summary metrics — what leaderboards & feed read. Nullable = not captured.
    public double? DistanceMeters { get; init; }
    public double? ElevationGainMeters { get; init; }
    public double? AvgHeartRate { get; init; }
    public double? MaxHeartRate { get; init; }
    public double? AvgPowerWatts { get; init; }
    public double? AvgCadence { get; init; }
    public double? Calories { get; init; }
    public double? TrainingLoad { get; init; }        // TSS-style; passthrough if the device supplied it

    // Provenance — critical for dedup.
    public ActivitySource Source { get; init; }
    public string? SourceExternalId { get; init; }
    public string Fingerprint { get; init; } = "";

    // Detailed track — persisted as a gzipped blob, loaded only for map replay.
    public IReadOnlyList<TrackPoint> Track { get; init; } = [];
}

public sealed record TrackPoint(
    double Lat, double Lon, double? ElevM,
    int OffsetSec,                  // seconds from StartUtc
    double? HeartRate, double? PowerW, double? Cadence, double? SpeedMps);

/// <summary>Every collection surface implements exactly this. New source = new class.</summary>
public interface ISourceAdapter
{
    ActivitySource Source { get; }
    Task<Activity> NormalizeAsync(RawActivity raw, CancellationToken ct);
}
