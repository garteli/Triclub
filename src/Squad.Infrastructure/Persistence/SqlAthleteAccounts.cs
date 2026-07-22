// ===========================================================================
//  SqlAthleteAccounts.cs  —  IAthleteAccounts over SQL Server (Dapper).
//  An account is a dbo.Athlete row (see Sql/RawActivity.sql + Sql/Auth.sql).
//  Email is the login key; GoogleSub/AppleSub link federated identity.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlAthleteAccounts(string connectionString) : IAthleteAccounts
{
    private const string Cols =
        "Id, DisplayName, Initials, AvatarColor, SquadId, Email, PasswordHash, GoogleSub, AppleSub";

    public async Task<AthleteAccount?> FindByEmailAsync(string email, CancellationToken ct)
        => await QuerySingle($"SELECT {Cols} FROM dbo.Athlete WHERE Email = @email", new { email }, ct);

    public async Task<AthleteAccount?> GetAsync(Guid id, CancellationToken ct)
        => await QuerySingle($"SELECT {Cols} FROM dbo.Athlete WHERE Id = @id", new { id }, ct);

    public async Task<AthleteAccount?> FindByProviderAsync(ExternalProvider provider, string subject, CancellationToken ct)
    {
        var column = provider == ExternalProvider.Google ? "GoogleSub" : "AppleSub";
        return await QuerySingle($"SELECT {Cols} FROM dbo.Athlete WHERE {column} = @subject", new { subject }, ct);
    }

    public async Task CreateAsync(NewAthleteAccount a, CancellationToken ct)
    {
        // Self-service signups don't auto-join any club. Instead each new account gets its OWN
        // private "Solo" squad (Kind='personal') as its active squad, created atomically with the
        // athlete + an owner membership. Personal squads are hidden from Discover and the club board,
        // so a new user's feed/leaderboard/plan show only themselves until they deliberately join a
        // real club — via Discover or a coach's invite link. a.SquadId is that personal squad's id.
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        await using var tx = (SqlTransaction)await conn.BeginTransactionAsync(ct);

        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.Squad (Id, Name, Discipline, Kind, Color, OwnerId)
            VALUES (@SquadId, N'Solo', 'Triathlon', 'personal', @AvatarColor, @Id);
            """, a, tx, cancellationToken: ct));

        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.Athlete (Id, DisplayName, Initials, AvatarColor, SquadId, Email, PasswordHash, GoogleSub, AppleSub)
            VALUES (@Id, @DisplayName, @Initials, @AvatarColor, @SquadId, @Email, @PasswordHash, @GoogleSub, @AppleSub);
            """, a, tx, cancellationToken: ct));

        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.Membership (SquadId, AthleteId, Role) VALUES (@SquadId, @Id, 'owner');
            """, a, tx, cancellationToken: ct));

        await tx.CommitAsync(ct);
    }

    public async Task LinkProviderAsync(Guid id, ExternalProvider provider, string subject, CancellationToken ct)
    {
        var column = provider == ExternalProvider.Google ? "GoogleSub" : "AppleSub";
        var sql = $"UPDATE dbo.Athlete SET {column} = @subject WHERE Id = @id";
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new { id, subject }, cancellationToken: ct));
    }

    private async Task<AthleteAccount?> QuerySingle(string sql, object args, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<AthleteAccount>(
            new CommandDefinition(sql, args, cancellationToken: ct));
    }
}
