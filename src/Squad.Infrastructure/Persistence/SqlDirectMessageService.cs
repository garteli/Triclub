// ===========================================================================
//  SqlDirectMessageService.cs  —  IDirectMessageService over SQL Server (Dapper).
//  1:1 direct-message threads. Messages are enriched with the sender's display
//  fields (joined from dbo.Athlete) so the client renders them directly. Both
//  directions of a pair share dbo.DirectMessage.ConvKey, so a thread is one range.
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

public sealed class SqlDirectMessageService(string connectionString) : IDirectMessageService
{
    private const string SelectEnriched = """
        SELECT m.Id, m.SenderId, m.RecipientId,
               a.DisplayName AS SenderName, a.Initials, a.AvatarColor,
               m.Body, m.CreatedUtc
        FROM dbo.DirectMessage m
        JOIN dbo.Athlete a ON a.Id = m.SenderId
        """;

    // The conversation key is built in SQL from the two ids so it uses SQL Server's own
    // uniqueidentifier ordering — the exact comparison behind the PERSISTED ConvKey column.
    // (Building it in C# would risk a different order than SQL's and miss the index range.)
    private const string ConvKeyExpr =
        "(CONVERT(CHAR(36), IIF(@me < @peer, @me, @peer)) + '|' + CONVERT(CHAR(36), IIF(@me < @peer, @peer, @me)))";

    public async Task<IReadOnlyList<DirectMessageItem>> GetThreadAsync(Guid me, Guid peer, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 200);
        // Newest `top` then flip to chronological so the client appends naturally.
        var sql = $"""
            SELECT * FROM (
                {SelectEnriched.Replace("SELECT m.Id", $"SELECT TOP {top} m.Id")}
                WHERE m.ConvKey = {ConvKeyExpr}
                ORDER BY m.CreatedUtc DESC
            ) recent
            ORDER BY recent.CreatedUtc ASC;
            """;
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<DirectMessageItem>(
            new CommandDefinition(sql, new { me, peer }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<DirectMessageItem?> PostAsync(Guid sender, Guid recipient, string body, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        const string insert = """
            INSERT INTO dbo.DirectMessage (Id, SenderId, RecipientId, Body)
            VALUES (@id, @sender, @recipient, @body);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(insert, new { id, sender, recipient, body }, cancellationToken: ct));

        return await conn.QuerySingleOrDefaultAsync<DirectMessageItem>(new CommandDefinition(
            SelectEnriched + " WHERE m.Id = @id;", new { id }, cancellationToken: ct));
    }
}
