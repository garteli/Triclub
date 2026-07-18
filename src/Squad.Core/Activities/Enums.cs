namespace Squad.Core;

/// <summary>Canonical sport classification. Persisted as TINYINT.</summary>
public enum ActivitySport : byte
{
    Other = 0,
    Swim = 1,
    Bike = 2,
    Run = 3,
}

/// <summary>
/// Where an activity was collected. Persisted as TINYINT. Order is not
/// significance — richness ranking lives in <see cref="SourceRank"/>.
/// </summary>
public enum ActivitySource : byte
{
    FitUpload = 0,      // .FIT/.GPX/.TCX dropped into the web uploader
    HealthKit = 1,      // Apple Health via the iOS companion app
    HealthConnect = 2,  // Android Health Connect via the companion app
    Garmin = 3,         // Garmin push webhook (dormant until access opens)
}
