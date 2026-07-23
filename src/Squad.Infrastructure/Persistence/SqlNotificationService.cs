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
    public async Task AddAsync(Guid recipientId, string kind, Guid? actorId, string actorName, string text, Guid? squadId, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.Notification (Id, RecipientId, Kind, ActorId, ActorName, Text, SquadId)
            VALUES (NEWID(), @recipientId, @kind, @actorId, @actorName, @text, @squadId);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql,
            new { recipientId, kind, actorId, actorName, text, squadId }, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<Notification>> GetRecentAsync(Guid recipientId, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 100);
        // SquadName is resolved live from dbo.Squad (null if there's no squad or it was deleted).
        // Column order matches the Notification record constructor.
        var sql = $"""
            SELECT TOP {top} n.Id, n.RecipientId, n.Kind, n.ActorId, n.ActorName, n.Text, n.IsRead AS [Read], n.CreatedUtc,
                   n.SquadId, s.Name AS SquadName
            FROM dbo.Notification n
            LEFT JOIN dbo.Squad s ON s.Id = n.SquadId
            WHERE n.RecipientId = @recipientId
            ORDER BY n.CreatedUtc DESC;
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
