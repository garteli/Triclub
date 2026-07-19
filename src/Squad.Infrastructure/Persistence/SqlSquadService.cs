// ===========================================================================
//  SqlSquadService.cs  —  ISquadService over SQL Server (Dapper).
//  Squads + memberships. MemberCount is a correlated COUNT; IsMember is a flag
//  for the calling athlete. Joining (or creating) also sets dbo.Athlete.SquadId
//  — the athlete's *active* squad, which the feed/leaderboard/activities filter by.
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

public sealed class SqlSquadService(string connectionString) : ISquadService
{
    private const string SelectSummary = """
        SELECT s.Id, s.Name, s.Discipline, s.Location, s.Level, s.Kind, s.Price, s.PerLabel,
               s.Color, s.Rating, s.Description,
               (SELECT COUNT(*) FROM dbo.Membership m WHERE m.SquadId = s.Id) AS MemberCount,
               CAST(CASE WHEN EXISTS (
                    SELECT 1 FROM dbo.Membership mm WHERE mm.SquadId = s.Id AND mm.AthleteId = @me
               ) THEN 1 ELSE 0 END AS bit) AS IsMember,
               s.OwnerId,
               ISNULL((SELECT TOP 1 jr.Status FROM dbo.JoinRequest jr
                       WHERE jr.SquadId = s.Id AND jr.AthleteId = @me
                       ORDER BY jr.CreatedUtc DESC), 'none') AS RequestStatus
        FROM dbo.Squad s
        """;

    public async Task<IReadOnlyList<SquadSummary>> ListAsync(Guid? me, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<SquadSummary>(new CommandDefinition(
            SelectSummary + " ORDER BY MemberCount DESC, s.CreatedUtc DESC;",
            new { me = me ?? Guid.Empty }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<SquadSummary?> GetAsync(Guid id, Guid? me, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<SquadSummary>(new CommandDefinition(
            SelectSummary + " WHERE s.Id = @id;",
            new { id, me = me ?? Guid.Empty }, cancellationToken: ct));
    }

    public async Task<Guid> CreateAsync(SquadCreate sq, Guid ownerId, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.Squad (Id, Name, Discipline, Location, Level, Kind, Price, PerLabel, Color, Description, OwnerId)
            VALUES (@id, @Name, @Discipline, @Location, @Level, @Kind, @Price, @PerLabel, @Color, @Description, @ownerId);
            """, new { id, sq.Name, sq.Discipline, sq.Location, sq.Level, sq.Kind, sq.Price, sq.PerLabel, sq.Color, sq.Description, ownerId },
            tx, cancellationToken: ct));

        await AddMembership(conn, tx, id, ownerId, "owner", ct);
        await SetActiveSquad(conn, tx, ownerId, id, ct);

        await tx.CommitAsync(ct);
        return id;
    }

    public async Task JoinAsync(Guid squadId, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        await AddMembership(conn, tx, squadId, athleteId, "member", ct);
        await SetActiveSquad(conn, tx, athleteId, squadId, ct);

        await tx.CommitAsync(ct);
    }

    public async Task<JoinOutcome> JoinOrRequestAsync(Guid squadId, string kind, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        if (await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Membership WHERE SquadId=@squadId AND AthleteId=@athleteId) THEN 1 ELSE 0 END;",
                new { squadId, athleteId }, cancellationToken: ct)) == 1)
            return JoinOutcome.AlreadyMember;

        // Free squads: join immediately.
        if (string.Equals(kind, "free", StringComparison.OrdinalIgnoreCase))
        {
            await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
            await AddMembership(conn, tx, squadId, athleteId, "member", ct);
            await SetActiveSquad(conn, tx, athleteId, squadId, ct);
            await tx.CommitAsync(ct);
            return JoinOutcome.Joined;
        }

        // Gated squads: create a pending request (no-op if one already exists).
        var rows = await conn.ExecuteAsync(new CommandDefinition("""
            IF NOT EXISTS (SELECT 1 FROM dbo.JoinRequest WHERE SquadId=@squadId AND AthleteId=@athleteId AND Status='pending')
                INSERT INTO dbo.JoinRequest (Id, SquadId, AthleteId, Status) VALUES (NEWID(), @squadId, @athleteId, 'pending');
            """, new { squadId, athleteId }, cancellationToken: ct));
        return rows > 0 ? JoinOutcome.Requested : JoinOutcome.AlreadyRequested;
    }

    public async Task<IReadOnlyList<JoinRequestItem>> GetPendingRequestsForOwnerAsync(Guid ownerId, CancellationToken ct)
    {
        const string sql = """
            SELECT jr.SquadId, s.Name AS SquadName, jr.AthleteId,
                   a.DisplayName AS AthleteName, a.Initials, a.AvatarColor,
                   a.Ftp, a.WeeklyHours, jr.CreatedUtc
            FROM dbo.JoinRequest jr
            JOIN dbo.Squad s   ON s.Id = jr.SquadId
            JOIN dbo.Athlete a ON a.Id = jr.AthleteId
            WHERE jr.Status = 'pending' AND s.OwnerId = @ownerId
            ORDER BY jr.CreatedUtc DESC;
            """;
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<JoinRequestItem>(new CommandDefinition(sql, new { ownerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<string?> ApproveRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

        var applicant = await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT DisplayName FROM dbo.Athlete WHERE Id = @athleteId;", new { athleteId }, cancellationToken: ct));
        if (applicant is null) return null;

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        var updated = await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.JoinRequest SET Status='approved', DecidedUtc=SYSDATETIMEOFFSET() WHERE SquadId=@squadId AND AthleteId=@athleteId AND Status='pending';",
            new { squadId, athleteId }, tx, cancellationToken: ct));
        if (updated == 0) { await tx.RollbackAsync(ct); return null; }

        await AddMembership(conn, tx, squadId, athleteId, "member", ct);
        await tx.CommitAsync(ct);
        return applicant;
    }

    public async Task<string?> DeclineRequestAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

        var applicant = await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
            "SELECT DisplayName FROM dbo.Athlete WHERE Id = @athleteId;", new { athleteId }, cancellationToken: ct));

        var updated = await conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.JoinRequest SET Status='declined', DecidedUtc=SYSDATETIMEOFFSET() WHERE SquadId=@squadId AND AthleteId=@athleteId AND Status='pending';",
            new { squadId, athleteId }, cancellationToken: ct));
        return updated > 0 ? applicant : null;
    }

    private static async Task<bool> OwnsSquad(SqlConnection conn, Guid squadId, Guid ownerId, CancellationToken ct)
        => await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Squad WHERE Id=@squadId AND OwnerId=@ownerId) THEN 1 ELSE 0 END;",
            new { squadId, ownerId }, cancellationToken: ct)) == 1;

    // Idempotent membership insert (no-op if already a member; keeps an existing role).
    private static Task AddMembership(SqlConnection conn, SqlTransaction tx, Guid squadId, Guid athleteId, string role, CancellationToken ct)
        => conn.ExecuteAsync(new CommandDefinition("""
            IF NOT EXISTS (SELECT 1 FROM dbo.Membership WHERE SquadId = @squadId AND AthleteId = @athleteId)
                INSERT INTO dbo.Membership (SquadId, AthleteId, Role) VALUES (@squadId, @athleteId, @role);
            """, new { squadId, athleteId, role }, tx, cancellationToken: ct));

    private static Task SetActiveSquad(SqlConnection conn, SqlTransaction tx, Guid athleteId, Guid squadId, CancellationToken ct)
        => conn.ExecuteAsync(new CommandDefinition(
            "UPDATE dbo.Athlete SET SquadId = @squadId WHERE Id = @athleteId;",
            new { squadId, athleteId }, tx, cancellationToken: ct));
}
