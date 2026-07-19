// ===========================================================================
//  SqlChatService.cs  —  IChatService over SQL Server (Dapper).
//  Squad chat history + posting. Messages are enriched with the sender's
//  display fields (joined from dbo.Athlete) so the client renders them directly.
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

public sealed class SqlChatService(string connectionString) : IChatService
{
    private const string SelectEnriched = """
        SELECT m.Id, m.SquadId, m.AthleteId,
               a.DisplayName AS AthleteName, a.Initials, a.AvatarColor,
               m.Body, m.CreatedUtc
        FROM dbo.Message m
        JOIN dbo.Athlete a ON a.Id = m.AthleteId
        """;

    public async Task<IReadOnlyList<ChatMessage>> GetRecentAsync(Guid squadId, int take, CancellationToken ct)
    {
        var top = Math.Clamp(take, 1, 200);
        // Newest `top` then flip to chronological so the client appends naturally.
        var sql = $"""
            SELECT * FROM (
                {SelectEnriched.Replace("SELECT m.Id", $"SELECT TOP {top} m.Id")}
                WHERE m.SquadId = @squadId
                ORDER BY m.CreatedUtc DESC
            ) recent
            ORDER BY recent.CreatedUtc ASC;
            """;
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<ChatMessage>(new CommandDefinition(sql, new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<ChatMessage?> PostAsync(Guid squadId, Guid athleteId, string body, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        const string insert = """
            INSERT INTO dbo.Message (Id, SquadId, AthleteId, Body) VALUES (@id, @squadId, @athleteId, @body);
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(insert, new { id, squadId, athleteId, body }, cancellationToken: ct));

        return await conn.QuerySingleOrDefaultAsync<ChatMessage>(new CommandDefinition(
            SelectEnriched + " WHERE m.Id = @id;", new { id }, cancellationToken: ct));
    }
}
