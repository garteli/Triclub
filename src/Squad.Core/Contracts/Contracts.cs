namespace Squad.Core;

// ----- Live feed -----

/// <summary>A squad feed card, enriched from the canonical Activity by the fan-out.</summary>
public sealed record ActivityFeedItem
{
    public Guid Id { get; init; }
    public Guid AthleteId { get; init; }
    public string AthleteName { get; init; } = "";
    public string Initials { get; init; } = "";
    public string AvatarColor { get; init; } = "#d6ff3f";
    public string Sport { get; init; } = "";
    public string Icon { get; init; } = "";
    public string DiscColor { get; init; } = "";
    public string Action { get; init; } = "";
    public string Metric { get; init; } = "";
    public DateTimeOffset StartUtc { get; init; }
    public int Reacts { get; init; }
}

// ----- Leaderboard -----

/// <summary>
/// One athlete's weekly standing. Load = ΣTSS; VolumeHours = ΣMovingTime; per-discipline
/// loads; Streak = consecutive days ending today/yesterday; Move = load-rank change vs last week.
/// </summary>
public sealed record LeaderboardRow
{
    public Guid AthleteId { get; init; }
    public string Name { get; init; } = "";
    public string Initials { get; init; } = "";
    public string Color { get; init; } = "#d6ff3f";
    public bool You { get; init; }
    public double Load { get; init; }
    public double VolumeHours { get; init; }
    public int Streak { get; init; }
    public double SwimLoad { get; init; }
    public double BikeLoad { get; init; }
    public double RunLoad { get; init; }
    public int Move { get; init; }
}

// ----- Live ride -----

/// <summary>What a rider's own device streams up during a live ride.</summary>
public sealed record RiderTelemetry(
    double Lat, double Lon, double? ElevM,
    double? SpeedKph, double? HeartRate, double? Cadence, double? PowerW, double? DistanceKm,
    int? RadarThreatLevel = null, int? RadarVehicleCount = null,
    double? RadarClosestMeters = null, double? RadarClosestClosingKph = null);

/// <summary>What every watcher receives — telemetry enriched with rider identity.</summary>
public sealed record RiderUpdate
{
    public Guid AthleteId { get; init; }
    public string Name { get; init; } = "";
    public string Initials { get; init; } = "";
    public string Color { get; init; } = "#d6ff3f";
    public double Lat { get; init; }
    public double Lon { get; init; }
    public double? SpeedKph { get; init; }
    public double? HeartRate { get; init; }
    public double? PowerW { get; init; }
    public double? DistanceKm { get; init; }
    public int? RadarThreatLevel { get; init; }
    public int? RadarVehicleCount { get; init; }
    public double? RadarClosestMeters { get; init; }
    public long Ts { get; init; }
}
