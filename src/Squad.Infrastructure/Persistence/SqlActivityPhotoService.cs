// ===========================================================================
//  SqlActivityPhotoService.cs  —  IActivityPhotoService over SQL Server (Dapper).
//  Persists dbo.ActivityPhoto rows (the blobs live in IImageStore). Reads resolve
//  both explicitly-attached photos and in-ride captures (ActivityId NULL) whose
//  CapturedUtc falls in the owning activity's [start, start+elapsed] window.
//  See Sql/Images.sql.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlActivityPhotoService(string connectionString) : IActivityPhotoService
{
    public async Task<Guid> AddAsync(Guid athleteId, Guid? activityId, string blobName, DateTimeOffset capturedUtc, CancellationToken ct)
    {
        const string sql = """
            DECLARE @id UNIQUEIDENTIFIER = NEWID();
            INSERT INTO dbo.ActivityPhoto (Id, AthleteId, ActivityId, BlobName, CapturedUtc)
            VALUES (@id, @athleteId, @activityId, @blobName, @capturedUtc);
            SELECT @id;
            """;
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<Guid>(
            new CommandDefinition(sql, new { athleteId, activityId, blobName, capturedUtc }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<ActivityPhotoRow>> ListForActivityAsync(Guid activityId, CancellationToken ct)
    {
        // Attached-to-this-activity OR an unattached in-ride capture by the same owner
        // whose CapturedUtc lands within the activity's elapsed window.
        const string sql = """
            DECLARE @owner UNIQUEIDENTIFIER, @start DATETIMEOFFSET, @end DATETIMEOFFSET;
            SELECT @owner = AthleteId, @start = StartUtc,
                   @end = DATEADD(second, ElapsedTimeSec, StartUtc)
              FROM dbo.Activity WHERE Id = @activityId;

            SELECT Id, AthleteId, ActivityId, CapturedUtc
              FROM dbo.ActivityPhoto
             WHERE ActivityId = @activityId
                OR (ActivityId IS NULL AND @owner IS NOT NULL AND AthleteId = @owner
                    AND CapturedUtc >= @start AND CapturedUtc <= @end)
             ORDER BY CapturedUtc ASC;
            """;
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<ActivityPhotoRow>(
            new CommandDefinition(sql, new { activityId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<string?> GetBlobNameAsync(Guid photoId, CancellationToken ct)
    {
        const string sql = "SELECT BlobName FROM dbo.ActivityPhoto WHERE Id = @photoId;";
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<string?>(
            new CommandDefinition(sql, new { photoId }, cancellationToken: ct));
    }

    public async Task<ActivityWindow?> GetActivityWindowAsync(Guid activityId, CancellationToken ct)
    {
        const string sql = """
            SELECT AthleteId, StartUtc,
                   DATEADD(second, ElapsedTimeSec, StartUtc) AS EndUtc
              FROM dbo.Activity WHERE Id = @activityId;
            """;
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<ActivityWindow?>(
            new CommandDefinition(sql, new { activityId }, cancellationToken: ct));
    }
}
