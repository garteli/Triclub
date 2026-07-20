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
                             THEN 1 ELSE 0 END AS bit) AS IKudoed
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
