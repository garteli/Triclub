using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// <see cref="IRouteImportService"/> that fetches a GPX from an external URL server-side (the browser
/// can't — <c>parse.off-road.io</c> sends no CORS headers) and parses it into a route.
///
/// URL handling:
///  • A direct GPX link (<c>parse.off-road.io/v1/download/{key}</c>, or any URL ending in <c>.gpx</c>,
///    or that serves <c>application/gpx+xml</c>) is downloaded as-is — the reliable path.
///  • An <c>off-road.io/track/{id}</c> map-page URL is resolved best-effort: the page is a SPA with no
///    embedded geometry, so we ask off-road.io's own track API for the track's <c>trackLayerKey</c> and
///    build the download URL from it. off-road.io keeps the page id and the download key in separate id
///    spaces with no public mapping, so this can miss — when it does we return a clear message telling
///    the user to paste the "Download GPX" link from the track page instead.
/// </summary>
public sealed class GpxUrlRouteImportService : IRouteImportService
{
    private const int MaxGpxBytes = 8 * 1024 * 1024;  // a long GPX is a few hundred KB; 8 MB is generous
    private const int MaxPoints = 20_000;             // matches the course store cap

    // off-road.io endpoints that return a track object carrying its trackLayerKey (the download key).
    private static readonly string[] OffRoadResolvers =
    {
        "https://api.off-road.io/_ah/api/offroadApi/v2/tracks/trackResult/{0}",
        "https://api.off-road.io/_ah/api/offroadApi/v2/tracks/{0}",
    };

    private static readonly Regex TrkPt = new(
        "<(?:trkpt|rtept)\\b[^>]*?\\blat=\"(?<lat>[-\\d.]+)\"[^>]*?\\blon=\"(?<lon>[-\\d.]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex TrackLayerKey = new(
        "\"trackLayerKey\"\\s*:\\s*\"?(?<key>\\d{6,})\"?", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex NameTag = new(
        "<name>(?<name>[^<]{1,200})</name>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly HttpClient _http;
    private readonly ILogger<GpxUrlRouteImportService> _log;

    public GpxUrlRouteImportService(HttpClient http, ILogger<GpxUrlRouteImportService> log)
    {
        _http = http;
        _log = log;
    }

    public async Task<RouteImportResult> ImportAsync(string url, CancellationToken ct)
    {
        if (!TryNormalizeUrl(url, out var uri))
            return RouteImportResult.Fail("That doesn't look like a valid link.");

        // Resolve the page/link to an actual GPX download URL.
        var (gpxUri, resolveError) = await ResolveGpxUrlAsync(uri, ct);
        if (gpxUri is null)
            return RouteImportResult.Fail(resolveError!);

        // Download the GPX.
        string gpx;
        try
        {
            using var req = new HttpRequestMessage(HttpMethod.Get, gpxUri);
            req.Headers.TryAddWithoutValidation("User-Agent",
                "Mozilla/5.0 (compatible; SquadBot/1.0; +https://squad.app)");
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/gpx+xml"));
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/xml"));
            req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));

            using var res = await _http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead, ct);
            if (!res.IsSuccessStatusCode)
            {
                _log.LogWarning("GPX fetch {Url} returned {Status}", gpxUri, (int)res.StatusCode);
                return RouteImportResult.Fail("Couldn't download the route from that link.");
            }
            if (res.Content.Headers.ContentLength is > MaxGpxBytes)
                return RouteImportResult.Fail("That route file is too large to import.");

            gpx = await ReadCappedAsync(res, ct);
        }
        catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "GPX fetch {Url} failed", gpxUri);
            return RouteImportResult.Fail("Couldn't reach that link. Check it and try again.");
        }

        // Parse track/route points.
        var points = ParsePoints(gpx);
        if (points.Count < 2)
            return RouteImportResult.Fail("No track points found in that route file.");

        // Prefer the GPX's own <name>, but off-road exports use a generic "Activity"/"Track" — fall
        // back to a link-derived name in that case so the saved course isn't just "Activity".
        var name = ExtractName(gpx) is { } n && !IsGenericName(n) ? n : DefaultName(uri);
        var km = TotalKm(points);
        return RouteImportResult.Success(new ImportedRoute(name, points, km));
    }

    // ── resolve any supported link to a direct GPX URL ──
    private async Task<(Uri? gpx, string? error)> ResolveGpxUrlAsync(Uri uri, CancellationToken ct)
    {
        var host = uri.Host.ToLowerInvariant();
        var path = uri.AbsolutePath;

        // Already a direct GPX: an off-road download link, or any .gpx URL.
        if (path.Contains("/download/", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".gpx", StringComparison.OrdinalIgnoreCase))
            return (uri, null);

        // off-road.io map-page URL (/track/{id}, /user/{u}/{id}, /pro/{biz}/track/{id}, …):
        // resolve the numeric track id to its download key via off-road.io's track API.
        if (host == "off-road.io" || host.EndsWith(".off-road.io", StringComparison.Ordinal))
        {
            var id = LastNumericSegment(path);
            if (id is null)
                return (null, "That off-road.io link doesn't point at a track.");

            var key = await ResolveOffRoadKeyAsync(id, ct);
            if (key is not null
                && Uri.TryCreate($"https://parse.off-road.io/v1/download/{key}", UriKind.Absolute, out var dl))
                return (dl, null);

            return (null,
                "Couldn't read that off-road.io track automatically. Open the track, tap “Download GPX”, "
                + "and paste that link here instead.");
        }

        // Anything else: try it as a direct GPX URL (parsing will reject it if it isn't one).
        return (uri, null);
    }

    // Ask off-road.io's track API for a track's trackLayerKey (the id used by the GPX download).
    private async Task<string?> ResolveOffRoadKeyAsync(string trackId, CancellationToken ct)
    {
        foreach (var template in OffRoadResolvers)
        {
            var url = string.Format(CultureInfo.InvariantCulture, template, trackId);
            try
            {
                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                req.Headers.TryAddWithoutValidation("User-Agent",
                    "Mozilla/5.0 (compatible; SquadBot/1.0; +https://squad.app)");
                req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

                using var res = await _http.SendAsync(req, ct);
                if (!res.IsSuccessStatusCode) continue;

                var json = await res.Content.ReadAsStringAsync(ct);
                var m = TrackLayerKey.Match(json);
                if (m.Success) return m.Groups["key"].Value;
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { throw; }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "off-road resolver {Url} failed", url);
            }
        }
        return null;
    }

    // ── GPX parsing ──
    private static List<double[]> ParsePoints(string gpx)
    {
        var pts = new List<double[]>();
        foreach (Match m in TrkPt.Matches(gpx))
        {
            if (double.TryParse(m.Groups["lat"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var lat)
                && double.TryParse(m.Groups["lon"].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var lon)
                && lat is >= -90 and <= 90 && lon is >= -180 and <= 180)
            {
                pts.Add(new[] { lat, lon });
                if (pts.Count >= MaxPoints) break;
            }
        }
        return pts;
    }

    private static string? ExtractName(string gpx)
    {
        var m = NameTag.Match(gpx);
        if (!m.Success) return null;
        var name = System.Net.WebUtility.HtmlDecode(m.Groups["name"].Value).Trim();
        return name.Length == 0 ? null : (name.Length > 120 ? name[..120] : name);
    }

    private static bool IsGenericName(string name) =>
        name.Equals("Activity", StringComparison.OrdinalIgnoreCase)
        || name.Equals("Track", StringComparison.OrdinalIgnoreCase)
        || name.Equals("Untitled", StringComparison.OrdinalIgnoreCase);

    private static string DefaultName(Uri uri)
    {
        var seg = LastNumericSegment(uri.AbsolutePath);
        var offRoad = uri.Host.EndsWith("off-road.io", StringComparison.OrdinalIgnoreCase);
        if (seg is not null && offRoad) return $"Off-Road route {seg}";
        return "Imported route";
    }

    // Total polyline length in km (haversine).
    private static double TotalKm(IReadOnlyList<double[]> pts)
    {
        const double R = 6371.0088; // mean Earth radius, km
        double km = 0;
        for (var i = 1; i < pts.Count; i++)
        {
            var (lat1, lon1) = (pts[i - 1][0], pts[i - 1][1]);
            var (lat2, lon2) = (pts[i][0], pts[i][1]);
            var dLat = Deg2Rad(lat2 - lat1);
            var dLon = Deg2Rad(lon2 - lon1);
            var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
                    + Math.Cos(Deg2Rad(lat1)) * Math.Cos(Deg2Rad(lat2))
                      * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
            km += R * 2 * Math.Asin(Math.Min(1, Math.Sqrt(a)));
        }
        return km;
    }

    private static double Deg2Rad(double d) => d * Math.PI / 180.0;

    // ── helpers ──
    private async Task<string> ReadCappedAsync(HttpResponseMessage res, CancellationToken ct)
    {
        await using var stream = await res.Content.ReadAsStreamAsync(ct);
        var buffer = new byte[MaxGpxBytes];
        var total = 0;
        int read;
        while (total < MaxGpxBytes
               && (read = await stream.ReadAsync(buffer.AsMemory(total, MaxGpxBytes - total), ct)) > 0)
            total += read;
        return System.Text.Encoding.UTF8.GetString(buffer, 0, total);
    }

    private static string? LastNumericSegment(string path)
    {
        var segs = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        for (var i = segs.Length - 1; i >= 0; i--)
            if (segs[i].Length >= 6 && ulong.TryParse(segs[i], out _)) return segs[i];
        return null;
    }

    private static bool TryNormalizeUrl(string? raw, out Uri uri)
    {
        uri = null!;
        var s = (raw ?? "").Trim();
        if (s.Length == 0) return false;
        if (!s.Contains("://")) s = "https://" + s;
        if (!Uri.TryCreate(s, UriKind.Absolute, out var u)) return false;
        if (u.Scheme != Uri.UriSchemeHttp && u.Scheme != Uri.UriSchemeHttps) return false;
        uri = u;
        return true;
    }
}
