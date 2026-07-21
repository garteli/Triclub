// ===========================================================================
//  SqlNotificationService.cs  —  INotificationService over SQL Server (Dapper).
//  Per-recipient notification inbox: append, read recent (newest first), mark read.
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

public sealed class SqlNotificationService(string connectionString) : INotificationService
{
    public async Task AddAsync(Guid recipientId, string kind, Guid? actorId, string actorName, string text, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.Notification (Id, RecipientId, Kind, ActorId, ActorName, Text)
            VALUES (NEWID(), @recipientId, @kind, @actorId, @actorName, @text);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql,
            new { recipientId, kind, actorId, actorName, text }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<Notification>> GetRecentAsync(Guid recipientId, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 100);
        var sql = $"""
            SELECT TOP {top} Id, RecipientId, Kind, ActorId, ActorName, Text, IsRead AS [Read], CreatedUtc
            FROM dbo.Notification WHERE RecipientId = @recipientId
            ORDER BY CreatedUtc DESC;
            """;
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<Notification>(new CommandDefinition(sql, new { recipientId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task MarkReadAsync(Guid recipientId, Guid notificationId, CancellationToken ct)
    {
        // Scoped to the recipient so an athlete can only mark their own notifications read.
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.Notification SET IsRead = 1 WHERE Id = @notificationId AND RecipientId = @recipientId AND IsRead = 0;",
            new { recipientId, notificationId }, cancellationToken: ct));
    }

    public async Task MarkAllReadAsync(Guid recipientId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.Notification SET IsRead = 1 WHERE RecipientId = @recipientId AND IsRead = 0;",
            new { recipientId }, cancellationToken: ct));
    }
}
