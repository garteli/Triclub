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
    /// <summary>Proxy path to the athlete's avatar photo (null when they have none → initials).</summary>
    public string? AvatarUrl { get; init; }
    /// <summary>Total kudos on this activity.</summary>
    public int Kudos { get; init; }
    /// <summary>Total comments on this activity.</summary>
    public int Comments { get; init; }
    /// <summary>Whether the athlete who requested this card has kudoed the activity.</summary>
    public bool IKudoed { get; init; }
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
    /// <summary>Proxy path to the athlete's avatar photo (null when they have none → initials).</summary>
    public string? AvatarUrl { get; init; }
}

/// <summary>
/// One club's weekly standing in the cross-club ranking. Load = ΣTSS of the club's
/// members; VolumeHours = ΣMovingTime; Members = roster size; Streak = the club's
/// average member streak (whole days); Move = load-rank change vs last week; Emblem is a
/// deterministic decorative glyph (peak|wave|wheel|bolt). You flags the caller's own club.
/// </summary>
public sealed record ClubRankingRow
{
    public Guid SquadId { get; init; }
    public string Name { get; init; } = "";
    public string Initials { get; init; } = "";
    public string Color { get; init; } = "#ff6a2c";
    public string Emblem { get; init; } = "peak";
    public bool You { get; init; }
    public double Load { get; init; }
    public double VolumeHours { get; init; }
    public int Members { get; init; }
    public int Streak { get; init; }
    public int Move { get; init; }
}

// ----- Live ride -----

/// <summary>What a rider's own device streams up during a live ride.</summary>
public sealed record RiderTelemetry(
    double Lat, double Lon, double? ElevM,
    double? SpeedKph, double? HeartRate, double? Cadence, double? PowerW, double? DistanceKm,
    int? RadarThreatLevel = null, int? RadarVehicleCount = null,
    double? RadarClosestMeters = null, double? RadarClosestClosingKph = null);

/// <summary>One phone-to-phone BLE range observation a device uploads: the caller
/// (observer, resolved from the connection — never trusted from the payload) saw
/// <see cref="PeerId"/>'s beacon at this RSSI / estimated metres.</summary>
public sealed record PeerRange(Guid PeerId, int Rssi, double? DistanceM);

/// <summary>A stored peer range, tagged with the observer and receipt time, ready for
/// the pack-position fusion pass to consume alongside GPS+heading.</summary>
public sealed record PeerRangeObservation(Guid ObserverId, Guid PeerId, int Rssi, double? DistanceM, long Ts);

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

    // Pack-position fusion output (null until BLE peer ranges refine this rider). FusedLat/Lon
    // are the sharpened coordinates the map prefers; NearestGapM is the fused spacing to the
    // closest ranged teammate. Fused flags that ranges — not just GPS — shaped the position.
    public double? FusedLat { get; init; }
    public double? FusedLon { get; init; }
    public double? NearestGapM { get; init; }
    public bool Fused { get; init; }
}
