using System;
using System.Collections.Generic;

namespace Squad.Core;

/// <summary>The result of fusing a rider's GPS fix with BLE ranges to teammates.</summary>
/// <param name="Lat">Refined latitude (equals the GPS latitude when no ranges applied).</param>
/// <param name="Lon">Refined longitude.</param>
/// <param name="NearestGapM">Fused distance to the closest ranged teammate, or null when none.</param>
/// <param name="Fused">True when at least one BLE range shaped the position.</param>
public readonly record struct FusedPosition(double Lat, double Lon, double? NearestGapM, bool Fused);

/// <summary>
/// Pack-position fusion: refine one rider's position from its GPS prior plus phone-to-phone
/// BLE ranges to teammates whose positions are treated as known anchors. GPS is good to
/// ~5 m — useless for "who's on whose wheel" — while BLE RSSI ranges are noisy but tight at
/// close quarters, so fusing the two sharpens in-pack spacing without letting the pack drift.
///
/// Solved by Guttman majorization (the SMACOF update): a stable, learning-rate-free iteration
/// that pulls the estimate toward sitting <c>range</c> metres from each anchor while a GPS
/// term keeps it near the observed fix. Points are worked in a local east/north metre frame
/// around the GPS fix — exact enough for a pack spanning tens of metres.
/// </summary>
public static class PackFusion
{
    /// <param name="gpsLat">The rider's own GPS latitude.</param>
    /// <param name="gpsLon">The rider's own GPS longitude.</param>
    /// <param name="neighbors">Teammates with a fresh range: their (lat, lon) and the measured metres.</param>
    /// <param name="gpsWeight">
    /// Weight of the GPS anchor relative to each BLE range (each range has weight 1). Below 1 so
    /// the ranges dominate spacing while GPS still prevents absolute drift.
    /// </param>
    /// <param name="iterations">Majorization steps; converges quickly for a handful of anchors.</param>
    public static FusedPosition Localize(
        double gpsLat, double gpsLon,
        IReadOnlyList<(double Lat, double Lon, double RangeM)> neighbors,
        double gpsWeight = 0.25, int iterations = 24)
    {
        if (neighbors is null || neighbors.Count == 0)
            return new FusedPosition(gpsLat, gpsLon, null, false);

        // Local equirectangular projection around the GPS fix (origin). Metres per degree.
        double mPerDegLat = 111_320.0;
        double mPerDegLon = 111_320.0 * Math.Cos(gpsLat * Math.PI / 180.0);
        if (Math.Abs(mPerDegLon) < 1.0) mPerDegLon = mPerDegLon < 0 ? -1.0 : 1.0; // guard near the poles

        var pts = new (double E, double N, double D)[neighbors.Count];
        for (int i = 0; i < neighbors.Count; i++)
        {
            double e = (neighbors[i].Lon - gpsLon) * mPerDegLon;
            double n = (neighbors[i].Lat - gpsLat) * mPerDegLat;
            pts[i] = (e, n, Math.Max(0.0, neighbors[i].RangeM));
        }

        // Start at the GPS position (the origin). The GPS anchor is a zero-distance target at
        // the origin, so its majorization contribution is just gpsWeight * (0,0).
        double x = 0.0, y = 0.0;
        for (int it = 0; it < iterations; it++)
        {
            double numE = 0.0, numN = 0.0, wSum = gpsWeight;
            for (int i = 0; i < pts.Length; i++)
            {
                double dx = x - pts[i].E, dy = y - pts[i].N;
                double dist = Math.Sqrt(dx * dx + dy * dy);
                double tE, tN;
                if (dist < 1e-6) { tE = pts[i].E; tN = pts[i].N; } // coincident — avoid div-by-zero
                else { tE = pts[i].E + pts[i].D * dx / dist; tN = pts[i].N + pts[i].D * dy / dist; }
                numE += tE; numN += tN; wSum += 1.0;
            }
            x = numE / wSum; y = numN / wSum;
        }

        // Nearest fused gap: closest anchor in the solved frame.
        double nearest = double.MaxValue;
        for (int i = 0; i < pts.Length; i++)
        {
            double dx = x - pts[i].E, dy = y - pts[i].N;
            double d = Math.Sqrt(dx * dx + dy * dy);
            if (d < nearest) nearest = d;
        }

        return new FusedPosition(
            gpsLat + y / mPerDegLat,
            gpsLon + x / mPerDegLon,
            nearest == double.MaxValue ? null : nearest,
            true);
    }
}
