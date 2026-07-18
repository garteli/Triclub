using System;
using System.Security.Cryptography;
using System.Text;

namespace Squad.Ingest;

/// <summary>
/// Source-independent identity of a physical activity. The same ride arriving as a
/// .FIT, via HealthKit, and from Garmin must hash to the SAME value, so the rounding
/// below absorbs the small clock/distance differences between sources. Do NOT change
/// the rounding or the key format without a data migration — it changes every hash.
/// </summary>
public static class Fingerprint
{
    // Fingerprint = MD5( sport | round(StartUtc to 60s) | round(DistanceMeters to 100m) )
    public static string Compute(ActivitySport sport, DateTimeOffset startUtc, double? distanceMeters)
    {
        long startBucket = (long)Math.Round(startUtc.ToUnixTimeSeconds() / 60.0) * 60;
        long distBucket = distanceMeters is null ? -1 : (long)(Math.Round(distanceMeters.Value / 100.0) * 100);

        string key = $"{(int)sport}|{startBucket}|{distBucket}";
        byte[] hash = MD5.HashData(Encoding.UTF8.GetBytes(key));
        return Convert.ToHexString(hash).ToLowerInvariant(); // 32 chars → CHAR(32)
    }
}

/// <summary>
/// When a duplicate lands, keep the richest copy. Garmin's full .FIT via API and a
/// directly-uploaded .FIT are the fullest; native-health summaries can be thinner.
/// Higher wins. This is the ONE place the priority is defined.
/// </summary>
public static class SourceRank
{
    public static int Of(ActivitySource source) => source switch
    {
        ActivitySource.Garmin        => 3,
        ActivitySource.FitUpload     => 2,
        ActivitySource.HealthKit     => 1,
        ActivitySource.HealthConnect => 1,
        _ => 0,
    };
}
