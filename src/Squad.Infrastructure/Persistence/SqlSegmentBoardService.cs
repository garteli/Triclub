// ===========================================================================
//  SqlSegmentBoardService.cs  —  ISegmentBoardService over SQL Server.
//  Ad-hoc segment leaderboard: there is no stored segment table. Each request
//  carries a polyline (a section of one activity's route); we scan candidate
//  activities' stored GPS tracks, find the ones that actually covered that same
//  stretch (near start + near end + right length + right shape), time each
//  rider's effort over it and rank the fastest per rider.
//
//  Cost is bounded: candidates capped, and each decompressed track is cached
//  (IMemoryCache) so scope toggles / re-opens don't re-read the blobs.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Caching.Memory;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlSegmentBoardService(string connectionString, IMemoryCache cache) : ISegmentBoardService
{
    private const int MaxCandidates = 200;   // recent activities scanned per request
    private const double StartEndTolM = 40;  // how close a track must pass the segment's start/end
    private const double ShapeTolM = 65;     // how close it must pass the mid-points (rejects other roads)
    private const double LenTolFrac = 0.30;  // GPS length must be within ±30% of the segment length

    private readonly record struct Pt(double Lat, double Lon, int T);
    private sealed record Cand(Guid Id, Guid AthleteId, string Name, string Initials, string AvatarColor, string? AvatarUrl, DateTimeOffset StartUtc);

    public async Task<SegmentBoard> GetAsync(Guid squadId, Guid viewerId, SegmentBoardRequest req, CancellationToken ct)
    {
        var path = (req.Path ?? [])
            .Where(p => p is { Length: >= 2 } && double.IsFinite(p[0]) && double.IsFinite(p[1]))
            .Select(p => new[] { p[0], p[1] }).ToArray();
        if (path.Length < 2 || req.LengthM <= 0) return new SegmentBoard([]);

        var scope = (req.Scope ?? "squad").ToLowerInvariant();
        var yearStart = new DateTimeOffset(new DateTime(DateTime.UtcNow.Year, 1, 1), TimeSpan.Zero);

        var where = scope switch
        {
            "all" => "",
            "year" => "AND a.StartUtc >= @yearStart",
            _ => "AND ath.SquadId = @squadId",
        };
        var sql = $"""
            SELECT TOP {MaxCandidates}
                   a.Id, a.AthleteId, ath.DisplayName AS Name, ath.Initials, ath.AvatarColor,
                   CASE WHEN ath.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.AthleteId)) END AS AvatarUrl,
                   a.StartUtc
              FROM dbo.Activity a
              JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
             WHERE a.TrackBlob IS NOT NULL AND a.Sport = @sport {where}
             ORDER BY a.StartUtc DESC;
            """;

        await using var conn = new SqlConnection(connectionString);
        var cands = (await conn.QueryAsync<Cand>(new CommandDefinition(sql,
            new { sport = (byte)req.Sport, squadId, yearStart }, cancellationToken: ct))).ToList();
        if (cands.Count == 0) return new SegmentBoard([]);

        // Bulk-load only the tracks we don't already have cached.
        var need = cands.Select(c => c.Id).Where(id => !cache.TryGetValue(TrackKey(id), out _)).ToList();
        if (need.Count > 0)
        {
            var blobs = await conn.QueryAsync<(Guid Id, byte[] TrackBlob)>(new CommandDefinition(
                "SELECT Id, TrackBlob FROM dbo.Activity WHERE Id IN @ids;", new { ids = need }, cancellationToken: ct));
            foreach (var (id, blob) in blobs)
                cache.Set(TrackKey(id), DecodeTrack(blob), new MemoryCacheEntryOptions { SlidingExpiration = TimeSpan.FromMinutes(15) });
        }

        // Best (fastest) matching effort per rider.
        var best = new Dictionary<Guid, (Cand c, int time, double kph)>();
        foreach (var c in cands)
        {
            ct.ThrowIfCancellationRequested();
            if (!cache.TryGetValue(TrackKey(c.Id), out Pt[]? pts) || pts is null || pts.Length < 2) continue;
            var m = Match(pts, path, req.LengthM);
            if (m is not { } hit) continue;
            if (!best.TryGetValue(c.AthleteId, out var cur) || hit.time < cur.time)
                best[c.AthleteId] = (c, hit.time, hit.kph);
        }

        var efforts = best.Values
            .OrderBy(v => v.time)
            .Select(v => new SegmentEffort(v.c.AthleteId, v.c.Name, v.c.Initials, v.c.AvatarColor, v.c.AvatarUrl,
                v.time, Math.Round(v.kph, 1), v.c.StartUtc, v.c.AthleteId == viewerId))
            .ToList();
        return new SegmentBoard(efforts);
    }

    private static string TrackKey(Guid id) => "seg-track:" + id.ToString("N");

    // Decompress the gzipped detail blob (see SqlActivityReadService) to the GPS points only.
    private static Pt[] DecodeTrack(byte[]? blob)
    {
        if (blob is null || blob.Length == 0) return [];
        try
        {
            using var input = new MemoryStream(blob);
            using var gzip = new GZipStream(input, CompressionMode.Decompress);
            using var reader = new StreamReader(gzip);
            var json = reader.ReadToEnd().TrimStart();
            List<TrackPoint> track = json.StartsWith('[')
                ? JsonSerializer.Deserialize<List<TrackPoint>>(json) ?? []
                : (JsonSerializer.Deserialize<ActivityDetail>(json)?.Track.ToList() ?? []);
            return track
                .Where(p => double.IsFinite(p.Lat) && double.IsFinite(p.Lon))
                .Select(p => new Pt(p.Lat, p.Lon, p.OffsetSec))
                .ToArray();
        }
        catch { return []; }
    }

    // Did this track cover the segment? Nearest point to the start, then nearest to the end after it,
    // validated by the covered GPS length and by passing near the segment's mid-points.
    private static (int time, double kph)? Match(Pt[] pts, double[][] path, double lengthM)
    {
        int i0 = Nearest(pts, path[0][0], path[0][1], 0, out double d0);
        if (i0 < 0 || d0 > StartEndTolM) return null;
        int i1 = Nearest(pts, path[^1][0], path[^1][1], i0 + 1, out double d1);
        if (i1 < 0 || d1 > StartEndTolM || i1 <= i0) return null;

        double gps = 0;
        for (int i = i0 + 1; i <= i1; i++) gps += Haversine(pts[i - 1].Lat, pts[i - 1].Lon, pts[i].Lat, pts[i].Lon);
        if (Math.Abs(gps - lengthM) > LenTolFrac * lengthM) return null;

        foreach (var f in new[] { 0.25, 0.5, 0.75 })
        {
            var p = PathAt(path, f);
            double closest = double.MaxValue;
            for (int i = i0; i <= i1; i++)
            {
                double dd = Haversine(pts[i].Lat, pts[i].Lon, p[0], p[1]);
                if (dd < closest) closest = dd;
            }
            if (closest > ShapeTolM) return null;
        }

        int time = pts[i1].T - pts[i0].T;
        if (time <= 0) return null;
        return (time, gps / time * 3.6);
    }

    private static int Nearest(Pt[] pts, double lat, double lon, int from, out double dist)
    {
        int idx = -1; dist = double.MaxValue;
        for (int i = from; i < pts.Length; i++)
        {
            double d = Haversine(pts[i].Lat, pts[i].Lon, lat, lon);
            if (d < dist) { dist = d; idx = i; }
        }
        return idx;
    }

    // The [lat,lon] a fraction of the way along the polyline (by cumulative distance).
    private static double[] PathAt(double[][] path, double frac)
    {
        double total = 0;
        var cum = new double[path.Length];
        for (int i = 1; i < path.Length; i++) { total += Haversine(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]); cum[i] = total; }
        if (total <= 0) return path[0];
        double target = frac * total;
        for (int i = 1; i < path.Length; i++)
        {
            if (cum[i] >= target)
            {
                double seg = cum[i] - cum[i - 1];
                double t = seg > 0 ? (target - cum[i - 1]) / seg : 0;
                return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
            }
        }
        return path[^1];
    }

    private static double Haversine(double la1, double lo1, double la2, double lo2)
    {
        const double R = 6371000, d = Math.PI / 180;
        double dLa = (la2 - la1) * d, dLo = (lo2 - lo1) * d;
        double a = Math.Sin(dLa / 2) * Math.Sin(dLa / 2)
                 + Math.Cos(la1 * d) * Math.Cos(la2 * d) * Math.Sin(dLo / 2) * Math.Sin(dLo / 2);
        return 2 * R * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }
}
