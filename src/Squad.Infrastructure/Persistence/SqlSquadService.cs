// ===========================================================================
//  SqlSquadService.cs  —  ISquadService over SQL Server (Dapper).
//  Squads + memberships. MemberCount is a correlated COUNT; IsMember is a flag
//  for the calling athlete. Joining (or creating) also sets dbo.Athlete.SquadId
//  — the athlete's *active* squad, which the feed/leaderboard/activities filter by.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
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
                       ORDER BY jr.CreatedUtc DESC), 'none') AS RequestStatus,
               CASE WHEN s.LogoBlob   IS NOT NULL THEN '/api/images/squads/' + LOWER(CONVERT(varchar(36), s.Id)) + '/logo'   END AS LogoUrl,
               CASE WHEN s.BannerBlob IS NOT NULL THEN '/api/images/squads/' + LOWER(CONVERT(varchar(36), s.Id)) + '/banner' END AS BannerUrl
        FROM dbo.Squad s
        """;

    public async Task<IReadOnlyList<SquadSummary>> ListAsync(Guid? me, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<SquadSummary>(new CommandDefinition(
            // Personal "Solo" squads (one per signup) are private — never list them in Discover.
            SelectSummary + " WHERE s.Kind <> 'personal' ORDER BY MemberCount DESC, s.CreatedUtc DESC;",
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

    public async Task<bool> SetActiveSquadAsync(Guid squadId, Guid athleteId, CancellationToken ct)
    {
        // Only switch to a squad the athlete is actually a member of — guards against
        // activating a club you never joined.
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.Athlete SET SquadId = @squadId
            WHERE Id = @athleteId
              AND EXISTS (SELECT 1 FROM dbo.Membership WHERE SquadId = @squadId AND AthleteId = @athleteId);
            """, new { squadId, athleteId }, cancellationToken: ct));
        return rows > 0;
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

    // ----- owner management: details/pricing, roster, images -----------------

    public async Task<bool> UpdateAsync(Guid squadId, Guid ownerId, SquadUpdate f, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return false;

        // COALESCE leaves any field the owner didn't send (null) unchanged. Empty
        // string is a real value here (e.g. clearing PerLabel for a free club).
        var updated = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.Squad SET
                Name        = COALESCE(@Name, Name),
                Discipline  = COALESCE(@Discipline, Discipline),
                Location    = COALESCE(@Location, Location),
                Level       = COALESCE(@Level, Level),
                Kind        = COALESCE(@Kind, Kind),
                Price       = COALESCE(@Price, Price),
                PerLabel    = COALESCE(@PerLabel, PerLabel),
                Color       = COALESCE(@Color, Color),
                Description = COALESCE(@Description, Description)
            WHERE Id = @squadId;
            """, new { squadId, f.Name, f.Discipline, f.Location, f.Level, f.Kind, f.Price, f.PerLabel, f.Color, f.Description },
            cancellationToken: ct));
        return updated > 0;
    }

    public async Task<IReadOnlyList<SquadMember>?> GetMembersAsync(Guid squadId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

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

    public async Task<AddMemberOutcome> AddMemberByEmailAsync(Guid squadId, string email, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return AddMemberOutcome.NotOwner;

        // SQL Server's default collation is case-insensitive, so this matches regardless of case.
        var athleteId = await conn.QuerySingleOrDefaultAsync<Guid?>(new CommandDefinition(
            "SELECT Id FROM dbo.Athlete WHERE Email = @email;", new { email }, cancellationToken: ct));
        if (athleteId is not { } aid) return AddMemberOutcome.AthleteNotFound;

        if (await conn.ExecuteScalarAsync<int>(new CommandDefinition(
                "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Membership WHERE SquadId=@squadId AND AthleteId=@aid) THEN 1 ELSE 0 END;",
                new { squadId, aid }, cancellationToken: ct)) == 1)
            return AddMemberOutcome.AlreadyMember;

        // Add to the roster only — don't hijack the athlete's active squad (Athlete.SquadId).
        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO dbo.Membership (SquadId, AthleteId, Role) VALUES (@squadId, @aid, 'member');",
            new { squadId, aid }, cancellationToken: ct));
        return AddMemberOutcome.Added;
    }

    public async Task<bool> RemoveMemberAsync(Guid squadId, Guid athleteId, Guid ownerId, CancellationToken ct)
    {
        if (athleteId == ownerId) return false; // the owner can't remove themselves
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return false;

        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        var deleted = await conn.ExecuteAsync(new CommandDefinition(
            "DELETE FROM dbo.Membership WHERE SquadId=@squadId AND AthleteId=@athleteId AND Role <> 'owner';",
            new { squadId, athleteId }, tx, cancellationToken: ct));
        if (deleted == 0) { await tx.RollbackAsync(ct); return false; }

        // Athlete.SquadId is NOT NULL: if this was their active squad, move them off it so their
        // feed/leaderboard stays valid — to their own private "Solo" squad when they have one (don't
        // re-drop them into a shared club they never chose), else the landing club for legacy users.
        await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.Athlete
            SET SquadId = COALESCE(
                (SELECT TOP 1 Id FROM dbo.Squad WHERE OwnerId = @athleteId AND Kind = 'personal' ORDER BY CreatedUtc),
                @landing)
            WHERE Id = @athleteId AND SquadId = @squadId AND @squadId <> @landing;
            """, new { athleteId, squadId, landing = Squads.Landing }, tx, cancellationToken: ct));

        await tx.CommitAsync(ct);
        return true;
    }

    // ----- invite links -------------------------------------------------------

    public async Task<string?> CreateInviteAsync(Guid squadId, Guid ownerId, bool reset, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

        if (reset)
            await conn.ExecuteAsync(new CommandDefinition(
                "UPDATE dbo.SquadInvite SET RevokedUtc = SYSDATETIMEOFFSET() WHERE SquadId = @squadId AND RevokedUtc IS NULL;",
                new { squadId }, cancellationToken: ct));
        else
        {
            // Reuse the squad's current active link so the coach can hand out one stable URL.
            var existing = await conn.QuerySingleOrDefaultAsync<string>(new CommandDefinition(
                "SELECT TOP 1 Token FROM dbo.SquadInvite WHERE SquadId = @squadId AND RevokedUtc IS NULL ORDER BY CreatedUtc DESC;",
                new { squadId }, cancellationToken: ct));
            if (existing is not null) return existing;
        }

        var token = NewToken();
        await conn.ExecuteAsync(new CommandDefinition(
            "INSERT INTO dbo.SquadInvite (Token, SquadId, CreatedBy) VALUES (@token, @squadId, @ownerId);",
            new { token, squadId, ownerId }, cancellationToken: ct));
        return token;
    }

    public async Task<InviteInfo?> GetInviteAsync(string token, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<InviteInfo>(new CommandDefinition("""
            SELECT i.Token, i.SquadId, s.Name AS SquadName, s.Discipline, s.Color,
                   (SELECT COUNT(*) FROM dbo.Membership m WHERE m.SquadId = s.Id) AS MemberCount,
                   -- Public, invite-scoped logo URL (no auth) so a logged-out invitee can see the club logo.
                   CASE WHEN s.LogoBlob IS NOT NULL
                        THEN '/api/invites/' + i.Token + '/logo' END AS LogoUrl
            FROM dbo.SquadInvite i
            JOIN dbo.Squad s ON s.Id = i.SquadId
            WHERE i.Token = @token AND i.RevokedUtc IS NULL;
            """, new { token }, cancellationToken: ct));
    }

    public async Task<AcceptInviteResult?> AcceptInviteAsync(string token, Guid athleteId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var sq = await conn.QuerySingleOrDefaultAsync<InviteSquadRow>(new CommandDefinition("""
            SELECT i.SquadId, s.Name AS SquadName, s.OwnerId
            FROM dbo.SquadInvite i
            JOIN dbo.Squad s ON s.Id = i.SquadId
            WHERE i.Token = @token AND i.RevokedUtc IS NULL;
            """, new { token }, cancellationToken: ct));
        if (sq is null) return null;

        var alreadyMember = await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Membership WHERE SquadId=@squadId AND AthleteId=@athleteId) THEN 1 ELSE 0 END;",
            new { squadId = sq.SquadId, athleteId }, cancellationToken: ct)) == 1;

        // An invite is the coach vouching for the invitee, so join immediately even on a gated
        // squad. Either way make it their active squad so they land in the group's feed.
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);
        await AddMembership(conn, tx, sq.SquadId, athleteId, "member", ct);
        await SetActiveSquad(conn, tx, athleteId, sq.SquadId, ct);
        await tx.CommitAsync(ct);

        return new AcceptInviteResult(
            alreadyMember ? AcceptInviteOutcome.AlreadyMember : AcceptInviteOutcome.Joined,
            sq.SquadId, sq.SquadName, sq.OwnerId);
    }

    private sealed record InviteSquadRow(Guid SquadId, string SquadName, Guid? OwnerId);

    // URL-safe, unguessable invite token (16 random bytes → base64url, ~22 chars).
    private static string NewToken()
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public async Task<string?> GetImageBlobAsync(Guid squadId, string kind, CancellationToken ct)
    {
        if (ImageColumn(kind) is not { } column) return null;
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<string?>(new CommandDefinition(
            $"SELECT {column} FROM dbo.Squad WHERE Id = @squadId;", new { squadId }, cancellationToken: ct));
    }

    public async Task<bool> SetImageBlobAsync(Guid squadId, string kind, string? blobName, Guid ownerId, CancellationToken ct)
    {
        if (ImageColumn(kind) is not { } column) return false;
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return false;
        await conn.ExecuteAsync(new CommandDefinition(
            $"UPDATE dbo.Squad SET {column} = @blobName WHERE Id = @squadId;",
            new { squadId, blobName }, cancellationToken: ct));
        return true;
    }

    // Whitelist kind → column so the interpolated column name is never user-controlled.
    private static string? ImageColumn(string kind) => kind switch
    {
        "logo" => "LogoBlob",
        "banner" => "BannerBlob",
        _ => null,
    };

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
