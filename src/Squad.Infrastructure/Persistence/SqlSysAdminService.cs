// ===========================================================================
//  SqlSysAdminService.cs  —  ISysAdminService over SQL Server (Dapper).
//  The moderation surface: list every user + club, and delete them. Destructive
//  actions run in a single transaction so they either fully succeed or roll back,
//  and they reassign an athlete's *active* squad (Athlete.SquadId) to their own
//  private squad when the club it pointed at goes away.
//
//  NOTE (Dapper record binding): the SELECT column order matches each record's
//  constructor parameter order — this codebase binds records positionally.
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

public sealed class SqlSysAdminService(string connectionString) : ISysAdminService
{
    public async Task<AdminOverview> GetOverviewAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleAsync<AdminOverview>(new CommandDefinition("""
            SELECT
                (SELECT COUNT(*) FROM dbo.Athlete)                       AS Users,
                (SELECT COUNT(*) FROM dbo.Squad WHERE Kind <> 'personal') AS Clubs,
                (SELECT COUNT(*) FROM dbo.Squad WHERE Kind =  'personal') AS PersonalSquads,
                (SELECT COUNT(*) FROM dbo.Activity)                      AS Activities;
            """, cancellationToken: ct));
    }

    public async Task<IReadOnlyList<AdminUserRow>> ListUsersAsync(string? search, CancellationToken ct)
    {
        var term = string.IsNullOrWhiteSpace(search) ? null : $"%{search.Trim()}%";
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<AdminUserRow>(new CommandDefinition("""
            SELECT a.Id, a.DisplayName AS Name, a.Email, a.Initials, a.AvatarColor,
                   a.SquadId AS ActiveSquadId, sq.Name AS ActiveSquadName,
                   (SELECT COUNT(*) FROM dbo.Membership m WHERE m.AthleteId = a.Id) AS Memberships,
                   (SELECT COUNT(*) FROM dbo.Activity ac WHERE ac.AthleteId = a.Id) AS Activities,
                   CAST(CASE WHEN EXISTS (
                        SELECT 1 FROM dbo.Squad s WHERE s.OwnerId = a.Id AND s.Kind <> 'personal'
                   ) THEN 1 ELSE 0 END AS bit) AS OwnsClub,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl
            FROM dbo.Athlete a
            LEFT JOIN dbo.Squad sq ON sq.Id = a.SquadId
            WHERE @term IS NULL OR a.DisplayName LIKE @term OR a.Email LIKE @term
            ORDER BY a.DisplayName;
            """, new { term }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<AdminSquadRow>> ListSquadsAsync(CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<AdminSquadRow>(new CommandDefinition("""
            SELECT s.Id, s.Name, s.Discipline, s.Kind, s.Color, s.Location,
                   (SELECT COUNT(*) FROM dbo.Membership m WHERE m.SquadId = s.Id) AS MemberCount,
                   s.OwnerId, o.DisplayName AS OwnerName, s.CreatedUtc,
                   CASE WHEN s.LogoBlob IS NOT NULL
                        THEN '/api/images/squads/' + LOWER(CONVERT(varchar(36), s.Id)) + '/logo' END AS LogoUrl
            FROM dbo.Squad s
            LEFT JOIN dbo.Athlete o ON o.Id = s.OwnerId
            ORDER BY CASE WHEN s.Kind = 'personal' THEN 1 ELSE 0 END, MemberCount DESC, s.CreatedUtc DESC;
            """, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<SquadMember>?> GetMembersAsync(Guid squadId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await Exists(conn, null, "dbo.Squad", "Id", squadId, ct)) return null;

        var rows = await conn.QueryAsync<SquadMember>(new CommandDefinition("""
            SELECT m.AthleteId, a.DisplayName AS Name, a.Initials, a.AvatarColor, m.Role, m.JoinedUtc,
                   CASE WHEN a.AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), a.Id)) END AS AvatarUrl
            FROM dbo.Membership m
            JOIN dbo.Athlete a ON a.Id = m.AthleteId
            WHERE m.SquadId = @squadId
            ORDER BY CASE m.Role WHEN 'owner' THEN 0 WHEN 'coach' THEN 1 ELSE 2 END, a.DisplayName;
            """, new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<AdminActionResult> DeleteSquadAsync(Guid squadId, CancellationToken ct)
    {
        if (squadId == Squads.Landing)
            return new AdminActionResult(AdminOutcome.Protected, "The landing club can't be deleted.");

        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var kind = await conn.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(
            "SELECT Kind FROM dbo.Squad WHERE Id = @squadId;", new { squadId }, cancellationToken: ct));
        if (kind is null) return new AdminActionResult(AdminOutcome.NotFound);
        if (string.Equals(kind, "personal", StringComparison.OrdinalIgnoreCase))
            return new AdminActionResult(AdminOutcome.Protected, "Personal squads are managed automatically and can't be deleted.");

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        // Move anyone whose active squad is this club back to their own private squad
        // (falling back to the landing club for legacy accounts that never got one).
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE a SET a.SquadId = COALESCE(
                    (SELECT TOP 1 Id FROM dbo.Squad p WHERE p.OwnerId = a.Id AND p.Kind = 'personal'),
                    @landing)
            FROM dbo.Athlete a
            WHERE a.SquadId = @squadId;
            """, new { squadId, landing = Squads.Landing }, tx, cancellationToken: ct));

        // Dependent rows, then the club itself. Deleting SquadEvent cascades its RSVPs.
        await conn.ExecuteAsync(new CommandDefinition("""
            DELETE FROM dbo.SquadTarget WHERE SquadId = @squadId;
            DELETE FROM dbo.JoinRequest WHERE SquadId = @squadId;
            DELETE FROM dbo.RidePayment WHERE SquadId = @squadId;
            DELETE FROM dbo.SquadEvent  WHERE SquadId = @squadId;
            DELETE FROM dbo.SquadInvite WHERE SquadId = @squadId;
            DELETE FROM dbo.Membership  WHERE SquadId = @squadId;
            DELETE FROM dbo.Squad       WHERE Id      = @squadId;
            """, new { squadId }, tx, cancellationToken: ct));

        await tx.CommitAsync(ct);
        return new AdminActionResult(AdminOutcome.Ok);
    }

    public async Task<AdminActionResult> RemoveMemberAsync(Guid squadId, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var role = await conn.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(
            "SELECT Role FROM dbo.Membership WHERE SquadId = @squadId AND AthleteId = @athleteId;",
            new { squadId, athleteId }, cancellationToken: ct));
        if (role is null) return new AdminActionResult(AdminOutcome.NotFound);
        if (string.Equals(role, "owner", StringComparison.OrdinalIgnoreCase))
            return new AdminActionResult(AdminOutcome.Protected, "Can't remove a group's owner — delete the group instead.");

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Membership WHERE SquadId = @squadId AND AthleteId = @athleteId AND Role <> 'owner';",
            new { squadId, athleteId }, tx, cancellationToken: ct));

        // If this was their active squad, move them back to their private squad.
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.Athlete
            SET SquadId = COALESCE(
                    (SELECT TOP 1 Id FROM dbo.Squad p WHERE p.OwnerId = @athleteId AND p.Kind = 'personal'),
                    @landing)
            WHERE Id = @athleteId AND SquadId = @squadId AND @squadId <> @landing;
            """, new { athleteId, squadId, landing = Squads.Landing }, tx, cancellationToken: ct));

        await tx.CommitAsync(ct);
        return new AdminActionResult(AdminOutcome.Ok);
    }

    public async Task<AdminActionResult> DeleteUserAsync(Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        if (!await Exists(conn, null, "dbo.Athlete", "Id", athleteId, ct))
            return new AdminActionResult(AdminOutcome.NotFound);

        // A user who owns a real club must have it handled first — deleting them would
        // orphan the club's members. Their own private squad is fine (deleted below).
        var ownsClub = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Squad WHERE OwnerId = @athleteId AND Kind <> 'personal') THEN 1 ELSE 0 END;",
            new { athleteId }, cancellationToken: ct));
        if (ownsClub == 1)
            return new AdminActionResult(AdminOutcome.OwnsClub, "This user owns a club. Delete or reassign that club first.");

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        // Everything that references the athlete, children before parents. Deleting the
        // athlete's own Activities cascades the kudos/comments *on* them; their kudos/comments
        // on *other* people's activities are cleared explicitly first. Their private squad is
        // theirs alone, so it (and its dependents) go too.
        await conn.ExecuteAsync(new CommandDefinition("""
            DELETE FROM dbo.ActivityKudos   WHERE AthleteId   = @id;
            DELETE FROM dbo.ActivityComment WHERE AthleteId   = @id;
            DELETE FROM dbo.Activity        WHERE AthleteId   = @id;
            DELETE FROM dbo.RawActivity     WHERE AthleteId   = @id;
            DELETE FROM dbo.HealthDaily     WHERE AthleteId   = @id;
            DELETE FROM dbo.AthleteGoal     WHERE AthleteId   = @id;
            DELETE FROM dbo.Course          WHERE OwnerId     = @id;
            DELETE FROM dbo.Follow          WHERE FollowerId  = @id OR FolloweeId = @id;
            DELETE FROM dbo.RidePayment     WHERE PayerId     = @id OR CoachId    = @id;
            DELETE FROM dbo.PlannedWorkout  WHERE AthleteId   = @id;
            DELETE FROM dbo.CoachPlan       WHERE OwnerId     = @id;
            DELETE FROM dbo.ActivityPhoto   WHERE AthleteId   = @id;
            DELETE FROM dbo.Notification    WHERE RecipientId = @id;
            DELETE FROM dbo.Message         WHERE AthleteId   = @id;
            DELETE FROM dbo.SquadEventRsvp  WHERE AthleteId   = @id;
            DELETE FROM dbo.SquadEvent      WHERE CreatedBy   = @id;   -- cascades remaining RSVPs
            DELETE FROM dbo.JoinRequest     WHERE AthleteId   = @id;
            DELETE FROM dbo.Membership      WHERE AthleteId   = @id;

            DECLARE @personal TABLE (Id UNIQUEIDENTIFIER PRIMARY KEY);
            INSERT INTO @personal SELECT Id FROM dbo.Squad WHERE OwnerId = @id AND Kind = 'personal';
            DELETE FROM dbo.SquadTarget WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.JoinRequest WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.RidePayment WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.SquadEvent  WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.SquadInvite WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.Membership  WHERE SquadId IN (SELECT Id FROM @personal);
            DELETE FROM dbo.Squad       WHERE Id      IN (SELECT Id FROM @personal);

            DELETE FROM dbo.Athlete WHERE Id = @id;
            """, new { id = athleteId }, tx, cancellationToken: ct));

        await tx.CommitAsync(ct);
        return new AdminActionResult(AdminOutcome.Ok);
    }

    private static async Task<bool> Exists(SqlConnection conn, SqlTransaction? tx, string table, string column, Guid id, CancellationToken ct)
        => await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            $"SELECT CASE WHEN EXISTS (SELECT 1 FROM {table} WHERE {column} = @id) THEN 1 ELSE 0 END;",
            new { id }, tx, cancellationToken: ct)) == 1;
}
