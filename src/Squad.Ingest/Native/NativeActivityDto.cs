// ===========================================================================
//  NativeActivityDto.cs
//  The JSON the iOS/Android companion apps POST. It deliberately MIRRORS the
//  canonical model so these adapters are near-passthrough — the device does the
//  HealthKit/Health Connect → normalized translation, the backend just maps 1:1.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;

namespace Squad.Ingest.Native;

public sealed record NativeActivityDto
{
    /// <summary>HealthKit workout UUID / Health Connect record id — stable, used for idempotency.</summary>
    public string ExternalId { get; init; } = "";

    public string Sport { get; init; } = "Other";   // "Bike" | "Run" | "Swim" | "Other" (lenient parse)
    public DateTimeOffset StartUtc { get; init; }
    public double MovingTimeSeconds { get; init; }
    public double ElapsedTimeSeconds { get; init; }

    public double? DistanceMeters { get; init; }
    public double? ElevationGainMeters { get; init; }
    public double? AvgHeartRate { get; init; }
    public double? MaxHeartRate { get; init; }
    public double? AvgPowerWatts { get; init; }
    public double? AvgCadence { get; init; }
    public double? Calories { get; init; }
    public double? TrainingLoad { get; init; }

    public List<NativeTrackPointDto> Track { get; init; } = [];
}

public sealed record NativeTrackPointDto(
    double Lat, double Lon, double? ElevM, int OffsetSec,
    double? HeartRate, double? PowerW, double? Cadence, double? SpeedMps);

public static class NativeJson
{
    // Web defaults: camelCase, case-insensitive — matches what the companion apps send.
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
}

public static class NativeActivityMapper
{
    public static Activity ToActivity(NativeActivityDto d, Guid athleteId, ActivitySource source)
    {
        if (string.IsNullOrWhiteSpace(d.ExternalId))
            throw new ArgumentException("Native activity is missing ExternalId (needed for idempotency + dedup).");

        var sport = ParseSport(d.Sport);
        var start = d.StartUtc.ToUniversalTime();

        return new Activity
        {
            Id = Guid.NewGuid(),
            AthleteId = athleteId,
            Sport = sport,
            StartUtc = start,
            MovingTime = TimeSpan.FromSeconds(d.MovingTimeSeconds),
            ElapsedTime = TimeSpan.FromSeconds(d.ElapsedTimeSeconds > 0 ? d.ElapsedTimeSeconds : d.MovingTimeSeconds),
            DistanceMeters = d.DistanceMeters,
            ElevationGainMeters = d.ElevationGainMeters,
            AvgHeartRate = d.AvgHeartRate,
            MaxHeartRate = d.MaxHeartRate,
            AvgPowerWatts = d.AvgPowerWatts,
            AvgCadence = d.AvgCadence,
            Calories = d.Calories,
            TrainingLoad = d.TrainingLoad,
            Source = source,
            SourceExternalId = d.ExternalId,
            Track = d.Track.Select(t => new TrackPoint(
                t.Lat, t.Lon, t.ElevM, t.OffsetSec, t.HeartRate, t.PowerW, t.Cadence, t.SpeedMps)).ToList(),
            // Same formula as the FIT path → the same physical ride hashes identically
            // across sources, so dedup collapses them.
            Fingerprint = Squad.Ingest.Fingerprint.Compute(sport, start, d.DistanceMeters),
        };
    }

    private static ActivitySport ParseSport(string s) => s.Trim().ToLowerInvariant() switch
    {
        "bike" or "cycling" or "biking" => ActivitySport.Bike,
        "run" or "running"              => ActivitySport.Run,
        "swim" or "swimming"            => ActivitySport.Swim,
        _                               => ActivitySport.Other,
    };
}
