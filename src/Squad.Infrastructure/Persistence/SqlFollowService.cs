// ===========================================================================
//  SqlFollowService.cs  —  IFollowService over SQL Server (Dapper).
//  Directed follow edges. Follow is idempotent (PK guards duplicates).
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlFollowService(string connectionString) : IFollowService
{
    public async Task FollowAsync(Guid followerId, Guid followeeId, CancellationToken ct)
    {
        if (followerId == followeeId) return; // can't follow yourself
        const string sql = """
            IF NOT EXISTS (SELECT 1 FROM dbo.Follow WHERE FollowerId = @followerId AND FolloweeId = @followeeId)
                INSERT INTO dbo.Follow (FollowerId, FolloweeId) VALUES (@followerId, @followeeId);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new { followerId, followeeId }, cancellationToken: ct));
    }

    public async Task UnfollowAsync(Guid followerId, Guid followeeId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Follow WHERE FollowerId = @followerId AND FolloweeId = @followeeId;",
            new { followerId, followeeId }, cancellationToken: ct));
    }

    public async Task<bool> IsFollowingAsync(Guid followerId, Guid followeeId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Follow WHERE FollowerId = @followerId AND FolloweeId = @followeeId) THEN 1 ELSE 0 END;",
            new { followerId, followeeId }, cancellationToken: ct)) == 1;
    }
}
