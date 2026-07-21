// ===========================================================================
//  SqlSquadTargetStore.cs — ISquadTargetStore over SQL Server (Dapper).
//  A squad's group target races. Add/remove guarded to the squad owner.
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

public sealed class SqlSquadTargetStore(string connectionString) : ISquadTargetStore
{
    public async Task<IReadOnlyList<SquadTarget>> ListAsync(Guid squadId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<SquadTarget>(new CommandDefinition("""
            SELECT Id, SquadId, Name, RaceDate, Location, EventUrl,
                   CAST(CreatedUtc AS datetimeoffset(0)) AS CreatedUtc
            FROM dbo.SquadTarget WHERE SquadId = @squadId ORDER BY CreatedUtc;
            """, new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<bool> IsOwnerAsync(Guid squadId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT COUNT(1) FROM dbo.Squad WHERE Id = @squadId AND OwnerId = @ownerId;",
            new { squadId, ownerId }, cancellationToken: ct)) > 0;
    }

    public async Task<SquadTarget?> AddAsync(
        Guid squadId, Guid ownerId, string name, string? raceDate, string? location, string? eventUrl, CancellationToken ct)
    {
        if (!await IsOwnerAsync(squadId, ownerId, ct)) return null;

        var id = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.SquadTarget (Id, SquadId, Name, RaceDate, Location, EventUrl, CreatedUtc)
            VALUES (@id, @squadId, @name, @raceDate, @location, @eventUrl, SYSDATETIMEOFFSET());
            """, new { id, squadId, name, raceDate, location, eventUrl }, cancellationToken: ct));
        return new SquadTarget(id, squadId, name, raceDate, location, eventUrl, now);
    }

    public async Task<bool> RemoveAsync(Guid squadId, Guid ownerId, Guid targetId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        // Delete only if the caller owns the squad the target belongs to.
        var removed = await conn.ExecuteAsync(new CommandDefinition("""
            DELETE t FROM dbo.SquadTarget t
            JOIN dbo.Squad s ON s.Id = t.SquadId
            WHERE t.Id = @targetId AND t.SquadId = @squadId AND s.OwnerId = @ownerId;
            """, new { targetId, squadId, ownerId }, cancellationToken: ct));
        return removed > 0;
    }
}
