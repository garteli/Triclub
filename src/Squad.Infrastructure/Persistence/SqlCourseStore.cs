// ===========================================================================
//  SqlCourseStore.cs — ICourseStore over SQL Server (Dapper).
//  A rider/coach's saved routes. Owner-scoped list/get/create/delete.
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

public sealed class SqlCourseStore(string connectionString) : ICourseStore
{
    public async Task<IReadOnlyList<CourseSummary>> ListAsync(Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<CourseSummary>(new CommandDefinition("""
            SELECT Id, Name, DistanceKm, PointCount, CAST(CreatedUtc AS datetimeoffset(0)) AS CreatedUtc
            FROM dbo.Course WHERE OwnerId = @ownerId ORDER BY CreatedUtc DESC;
            """, new { ownerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<Course?> GetAsync(Guid ownerId, Guid id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<Course>(new CommandDefinition("""
            SELECT Id, OwnerId, Name, Points, DistanceKm, PointCount, CAST(CreatedUtc AS datetimeoffset(0)) AS CreatedUtc
            FROM dbo.Course WHERE Id = @id AND OwnerId = @ownerId;
            """, new { id, ownerId }, cancellationToken: ct));
    }

    public async Task<Guid> CreateAsync(Guid ownerId, string name, string pointsJson, double? distanceKm, int pointCount, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.Course (Id, OwnerId, Name, Points, DistanceKm, PointCount, CreatedUtc)
            VALUES (@id, @ownerId, @name, @pointsJson, @distanceKm, @pointCount, SYSDATETIMEOFFSET());
            """, new { id, ownerId, name, pointsJson, distanceKm, pointCount }, cancellationToken: ct));
        return id;
    }

    public async Task<bool> DeleteAsync(Guid ownerId, Guid id, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var removed = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Course WHERE Id = @id AND OwnerId = @ownerId;",
            new { id, ownerId }, cancellationToken: ct));
        return removed > 0;
    }
}
