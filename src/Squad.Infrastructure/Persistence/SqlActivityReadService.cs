// ===========================================================================
//  SqlActivityReadService.cs  —  IActivityReadService over SQL Server (Dapper).
//  Recent activities for a squad, joined to athlete display fields. Returns full
//  summary metrics so the client can render both the list card and the detail
//  view without a second round-trip. TINYINT Sport is CAST to int for Dapper's
//  strict record-constructor binding (byte→int isn't widened).
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

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlActivityReadService(string connectionString) : IActivityReadService
{
    public async Task<IReadOnlyList<ActivitySummaryRow>> GetForSquadAsync(Guid squadId, Guid me, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 200);
        var sql = $"""
            SELECT TOP {top}
                   a.Id, a.AthleteId,
                   ath.DisplayName AS AthleteName, ath.Initials, ath.AvatarColor,
                   CAST(a.Sport AS int) AS Sport, a.StartUtc, a.MovingTimeSec, a.ElapsedTimeSec,
                   CAST(a.DistanceMeters AS float) AS DistanceMeters,
                   CAST(a.ElevationGainM AS float) AS ElevationGainM,
                   CAST(a.AvgHeartRate   AS float) AS AvgHeartRate,
                   CAST(a.AvgPowerWatts  AS float) AS AvgPowerWatts,
                   CAST(a.TrainingLoad   AS float) AS TrainingLoad,
                   CAST(a.Calories       AS float) AS Calories,
                   CASE WHEN ath.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.AthleteId)) END AS AvatarUrl,
                   (SELECT COUNT(*) FROM dbo.ActivityKudos k WHERE k.ActivityId = a.Id) AS Kudos,
                   (SELECT COUNT(*) FROM dbo.ActivityComment c WHERE c.ActivityId = a.Id) AS Comments,
                   CAST(CASE WHEN EXISTS (SELECT 1 FROM dbo.ActivityKudos k2
                                          WHERE k2.ActivityId = a.Id AND k2.AthleteId = @me)
                             THEN 1 ELSE 0 END AS bit) AS IKudoed,
                   -- DeviceName + WeatherJson last: Dapper binds this record's constructor positionally
                   -- by name, so the SELECT column order MUST match ActivitySummaryRow's parameter order
                   -- (…IKudoed, DeviceName, WeatherJson) or materialization throws once a row exists.
                   a.DeviceName, a.WeatherJson
            FROM dbo.Activity a
            JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
            WHERE ath.SquadId = @squadId
            ORDER BY a.StartUtc DESC;
            """;

        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<ActivitySummaryRow>(
            new CommandDefinition(sql, new { squadId, me }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<ActivityDetail?> GetDetailAsync(Guid activityId, Guid squadId, CancellationToken ct)
    {
        // Squad-scoped: only activities owned by a member of the caller's squad are visible.
        const string sql = """
            SELECT a.TrackBlob
              FROM dbo.Activity a
              JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
             WHERE a.Id = @activityId AND ath.SquadId = @squadId;
            """;

        await using var conn = new SqlConnection(connectionString);
        var blob = await conn.ExecuteScalarAsync<byte[]?>(
            new CommandDefinition(sql, new { activityId, squadId }, cancellationToken: ct));
        if (blob is null || blob.Length == 0) return null; // not visible, or no stored detail

        // Gzipped JSON written by SqlActivityRepository.GzipDetail. v2 is an ActivityDetail
        // object; v1 (pre-laps) was a bare TrackPoint[] — detect by the first JSON token so
        // already-imported activities still hydrate (with no laps).
        await using var input = new MemoryStream(blob);
        using var gzip = new GZipStream(input, CompressionMode.Decompress);
        using var reader = new StreamReader(gzip);
        var json = (await reader.ReadToEndAsync(ct)).TrimStart();
        if (json.StartsWith('['))
        {
            var track = JsonSerializer.Deserialize<List<TrackPoint>>(json) ?? [];
            return new ActivityDetail(track, []);
        }
        return JsonSerializer.Deserialize<ActivityDetail>(json) ?? new ActivityDetail([], []);
    }

    // "Rode together": other athletes in the same squad whose ride started within a short time
    // window and a short distance of this ride's start point, same sport. The window/radius are
    // deliberately generous enough to catch a shared club start, tight enough to exclude
    // unrelated rides from the same trailhead hours apart.
    private const int MatchWindowMinutes = 20;
    private const double MatchRadiusMeters = 750;

    private sealed record MatchAnchor(Guid AthleteId, int Sport, DateTimeOffset StartUtc, double? StartLat, double? StartLon);

    public async Task<IReadOnlyList<MatchedRide>> GetMatchedRidesAsync(Guid activityId, Guid squadId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);

        // Anchor: this activity's sport + start point + time, scoped to the caller's squad.
        const string anchorSql = """
            SELECT TOP 1 a.AthleteId, CAST(a.Sport AS int) AS Sport, a.StartUtc,
                         CAST(a.StartLat AS float) AS StartLat, CAST(a.StartLon AS float) AS StartLon
              FROM dbo.Activity a
              JOIN dbo.Athlete ath ON ath.Id = a.AthleteId
             WHERE a.Id = @activityId AND ath.SquadId = @squadId;
            """;
        var anchor = await conn.QueryFirstOrDefaultAsync<MatchAnchor>(
            new CommandDefinition(anchorSql, new { activityId, squadId }, cancellationToken: ct));
        if (anchor?.StartLat is null || anchor.StartLon is null)
            return [];   // not visible, or no GPS start point to match on

        var startMin = anchor.StartUtc.AddMinutes(-MatchWindowMinutes);
        var startMax = anchor.StartUtc.AddMinutes(MatchWindowMinutes);

        // Haversine on the denormalized start point (metres). Same squad, same sport, different
        // athlete, inside the time window and radius.
        const string matchSql = """
            SELECT a2.Id AS ActivityId, a2.AthleteId,
                   ath.DisplayName AS AthleteName, ath.Initials, ath.AvatarColor,
                   CAST(a2.DistanceMeters AS float) AS DistanceMeters,
                   a2.MovingTimeSec,
                   CAST(a2.AvgHeartRate AS float) AS AvgHeartRate,
                   CASE WHEN ath.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a2.AthleteId)) END AS AvatarUrl
              FROM dbo.Activity a2
              JOIN dbo.Athlete ath ON ath.Id = a2.AthleteId
             WHERE ath.SquadId = @squadId
               AND a2.Id <> @activityId
               AND a2.AthleteId <> @owner
               AND a2.Sport = @sport
               AND a2.StartLat IS NOT NULL AND a2.StartLon IS NOT NULL
               AND a2.StartUtc >= @startMin AND a2.StartUtc <= @startMax
               AND (2 * 6371000 * ASIN(SQRT(
                     POWER(SIN(RADIANS(a2.StartLat - @lat) / 2), 2) +
                     COS(RADIANS(@lat)) * COS(RADIANS(a2.StartLat)) *
                     POWER(SIN(RADIANS(a2.StartLon - @lon) / 2), 2)))) <= @radius
             ORDER BY a2.StartUtc;
            """;
        var rows = await conn.QueryAsync<MatchedRide>(new CommandDefinition(matchSql, new
        {
            squadId, activityId, owner = anchor.AthleteId, sport = (byte)anchor.Sport,
            startMin, startMax, lat = anchor.StartLat, lon = anchor.StartLon, radius = MatchRadiusMeters,
        }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<bool> DeleteAsync(Guid activityId, Guid athleteId, CancellationToken ct)
    {
        // Delete the canonical activity (owner-scoped) and its raw payload, keyed by the
        // activity's own (Source, SourceExternalId), so re-syncing the same workout isn't
        // deduped away as "already-received". @@ROWCOUNT of the Activity delete is the result.
        const string sql = """
            DECLARE @src TINYINT, @ext NVARCHAR(128);
            SELECT @src = Source, @ext = SourceExternalId
              FROM dbo.Activity WHERE Id = @activityId AND AthleteId = @athleteId;

            DELETE FROM dbo.Activity WHERE Id = @activityId AND AthleteId = @athleteId;
            DECLARE @n INT = @@ROWCOUNT;

            IF @n > 0 AND @ext IS NOT NULL
                DELETE FROM dbo.RawActivity
                 WHERE AthleteId = @athleteId AND Source = @src AND SourceExternalId = @ext;

            SELECT @n;
            """;

        await using var conn = new SqlConnection(connectionString);
        var affected = await conn.ExecuteScalarAsync<int>(
            new CommandDefinition(sql, new { activityId, athleteId }, cancellationToken: ct));
        return affected > 0;
    }
}
