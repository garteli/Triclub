using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// <see cref="IElevationService"/> backed by Open-Meteo's elevation API (free, no key). Samples
/// evenly along the route, reads the terrain for all samples in one request, and returns the same
/// profile shape the client caches. This runs from the server's IP, so it's the fallback when a
/// client is rate-limited; the result is cached on the event, so it's called at most once per route.
/// Best-effort: any failure returns null. Mirrors the port logic in the client's elevation.js.
/// </summary>
public sealed class OpenMeteoElevationService(HttpClient http, ILogger<OpenMeteoElevationService> log) : IElevationService
{
    public async Task<string?> ComputeAsync(string routePointsJson, CancellationToken ct)
    {
        var pts = ParsePoints(routePointsJson);
        if (pts.Count < 2) return null;
        var samples = SampleAlong(pts);
        if (samples.Count < 2) return null;

        var inv = CultureInfo.InvariantCulture;
        var lat = string.Join(",", samples.Select(s => s.Lat.ToString("F5", inv)));
        var lon = string.Join(",", samples.Select(s => s.Lon.ToString("F5", inv)));
        var url = $"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}";

        try
        {
            var resp = await http.GetFromJsonAsync<ElevationResponse>(url, ct);
            var els = resp?.Elevation;
            if (els is null || els.Length != samples.Count) return null;

            double ascent = 0;
            for (int i = 1; i < els.Length; i++) { var d = els[i] - els[i - 1]; if (d > 0) ascent += d; }

            var profile = samples.Select((s, i) => new ProfilePoint(Math.Round(s.Dist, 1), Math.Round(els[i], 1))).ToArray();
            var payload = new ElevationProfile(profile, (int)Math.Round(ascent), Math.Round(els.Min(), 1), Math.Round(els.Max(), 1));
            return JsonSerializer.Serialize(payload);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            log.LogWarning(ex, "Open-Meteo elevation lookup failed ({N} samples)", samples.Count);
            return null;
        }
    }

    // Parse [[lat,lon],…] JSON to clean, finite points.
    private static List<(double Lat, double Lon)> ParsePoints(string json)
    {
        var outPts = new List<(double, double)>();
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Array) return outPts;
            foreach (var p in root.EnumerateArray())
            {
                if (p.ValueKind != JsonValueKind.Array || p.GetArrayLength() < 2) continue;
                if (p[0].TryGetDouble(out var la) && p[1].TryGetDouble(out var lo)
                    && double.IsFinite(la) && double.IsFinite(lo))
                    outPts.Add((la, lo));
            }
        }
        catch { /* malformed → empty */ }
        return outPts;
    }

    // Sample N points evenly along the polyline (interpolating inside segments), each with its
    // cumulative distance (m). N scales with the route but is capped — matches the client.
    private static List<(double Lat, double Lon, double Dist)> SampleAlong(List<(double Lat, double Lon)> pts)
    {
        var seg = new List<(double A0, double A1, double B0, double B1, double D, double Start)>();
        double total = 0;
        for (int i = 1; i < pts.Count; i++)
        {
            var d = Haversine(pts[i - 1].Lat, pts[i - 1].Lon, pts[i].Lat, pts[i].Lon);
            seg.Add((pts[i - 1].Lat, pts[i - 1].Lon, pts[i].Lat, pts[i].Lon, d, total));
            total += d;
        }
        var outS = new List<(double, double, double)>();
        if (total <= 0) return outS;
        int n = Math.Min(90, Math.Max(12, pts.Count * 2));
        for (int k = 0; k < n; k++)
        {
            var target = total * k / (n - 1);
            var sg = seg.FirstOrDefault(x => target <= x.Start + x.D, seg[^1]);
            var f = sg.D > 0 ? (target - sg.Start) / sg.D : 0;
            outS.Add((sg.A0 + (sg.B0 - sg.A0) * f, sg.A1 + (sg.B1 - sg.A1) * f, target));
        }
        return outS;
    }

    private static double Haversine(double lat1, double lon1, double lat2, double lon2)
    {
        const double r = 6371000;
        double dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
        double a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                 + Math.Cos(lat1 * Math.PI / 180) * Math.Cos(lat2 * Math.PI / 180) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * r * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    private sealed class ElevationResponse
    {
        [JsonPropertyName("elevation")] public double[]? Elevation { get; set; }
    }

    // Serialized shape must match the client's buildElevationProfile result: { profile:[{dist,e}], ascent, min, max }.
    private sealed record ProfilePoint([property: JsonPropertyName("dist")] double Dist, [property: JsonPropertyName("e")] double E);
    private sealed record ElevationProfile(
        [property: JsonPropertyName("profile")] ProfilePoint[] Profile,
        [property: JsonPropertyName("ascent")] int Ascent,
        [property: JsonPropertyName("min")] double Min,
        [property: JsonPropertyName("max")] double Max);
}
