using System.Security.Cryptography;
using System.Text;

namespace Squad.Core;

/// <summary>
/// Source-independent identity of a physical activity. The same ride from a .FIT,
/// HealthKit, and Garmin must hash identically, so the rounding absorbs small
/// clock/distance differences. Changing the rounding or key format needs a migration.
/// </summary>
public static class Fingerprint
{
    // MD5( sport | round(StartUtc to 60s) | round(DistanceMeters to 100m) )
    public static string Compute(ActivitySport sport, DateTimeOffset startUtc, double? distanceMeters)
    {
        long startBucket = (long)Math.Round(startUtc.ToUnixTimeSeconds() / 60.0) * 60;
        long distBucket = distanceMeters is null ? -1 : (long)(Math.Round(distanceMeters.Value / 100.0) * 100);
        string key = $"{(int)sport}|{startBucket}|{distBucket}";
        return Convert.ToHexString(MD5.HashData(Encoding.UTF8.GetBytes(key))).ToLowerInvariant();
    }
}

/// <summary>
/// When a duplicate lands, keep the richest copy. Higher wins. The one place the
/// source priority is defined (by enum name, so it's independent of numeric values).
/// </summary>
public static class SourceRank
{
    public static int Of(ActivitySource source) => source switch
    {
        ActivitySource.Garmin => 3,
        ActivitySource.FitUpload => 2,
        ActivitySource.HealthKit => 1,
        ActivitySource.HealthConnect => 1,
        _ => 0,
    };
}
