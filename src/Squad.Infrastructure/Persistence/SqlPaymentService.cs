// ===========================================================================
//  SqlPaymentService.cs  —  IPaymentService over SQL Server (Dapper).
//  Ride-payment ledger. The coach (payee) is the squad's OwnerId, resolved at
//  creation; the club's cut is computed from the fee (bps) and snapshotted on the
//  row so historical totals stay stable even if the club later changes its rate.
//  No money moves here — Status just tracks owed → paid | waived.
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

public sealed class SqlPaymentService(string connectionString, int defaultFeeBps) : IPaymentService
{
    private const string SelectRow = """
        SELECT p.Id, p.SquadId, s.Name AS SquadName,
               p.PayerId, a.DisplayName AS PayerName, a.Initials AS PayerInitials, a.AvatarColor AS PayerAvatarColor,
               p.CoachId, p.Kind, p.AmountMinor, p.Currency, p.ClubFeeBps, p.ClubCutMinor, p.CoachNetMinor,
               p.Status, p.Method, p.Note, p.CreatedUtc, p.PaidUtc
        FROM dbo.RidePayment p
        JOIN dbo.Squad s   ON s.Id = p.SquadId
        JOIN dbo.Athlete a ON a.Id = p.PayerId
        """;

    public async Task<RidePayment?> CreateAsync(RidePaymentCreate body, Guid payerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // Payee is the squad owner. Null → no such squad, or a squad with no owner to pay.
        var coach = await conn.QuerySingleOrDefaultAsync<Guid?>(new CommandDefinition(
            "SELECT OwnerId FROM dbo.Squad WHERE Id = @squadId;",
            new { squadId = body.SquadId }, cancellationToken: ct));
        if (coach is not { } coachId) return null;

        var feeBps = Math.Clamp(body.ClubFeeBps ?? defaultFeeBps, 0, 10000);
        var amount = body.AmountMinor;
        var clubCut = amount * feeBps / 10000;
        var coachNet = amount - clubCut;
        var currency = string.IsNullOrWhiteSpace(body.Currency) ? "ILS" : body.Currency.Trim().ToUpperInvariant();
        var kind = NormalizeKind(body.Kind);
        var id = Guid.NewGuid();

        await conn.ExecuteAsync(new CommandDefinition("""
            INSERT INTO dbo.RidePayment
                (Id, SquadId, PayerId, CoachId, Kind, AmountMinor, Currency, ClubFeeBps, ClubCutMinor, CoachNetMinor, Status, Note)
            VALUES
                (@id, @SquadId, @payerId, @coachId, @kind, @amount, @currency, @feeBps, @clubCut, @coachNet, 'owed', @Note);
            """, new { id, body.SquadId, payerId, coachId, kind, amount, currency, feeBps, clubCut, coachNet, body.Note },
            cancellationToken: ct));

        return await GetRow(conn, id, ct);
    }

    public async Task<IReadOnlyList<RidePayment>> ListForPayerAsync(Guid payerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        var rows = await conn.QueryAsync<RidePayment>(new CommandDefinition(
            SelectRow + " WHERE p.PayerId = @payerId ORDER BY p.CreatedUtc DESC;",
            new { payerId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<IReadOnlyList<RidePayment>?> ListForSquadAsync(Guid squadId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

        var rows = await conn.QueryAsync<RidePayment>(new CommandDefinition(
            SelectRow + " WHERE p.SquadId = @squadId ORDER BY p.CreatedUtc DESC;",
            new { squadId }, cancellationToken: ct));
        return rows.ToList();
    }

    public async Task<RidePaymentSummary?> SummaryForSquadAsync(Guid squadId, Guid ownerId, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);
        if (!await OwnsSquad(conn, squadId, ownerId, ct)) return null;

        return await conn.QuerySingleAsync<RidePaymentSummary>(new CommandDefinition("""
            SELECT
                @squadId AS SquadId,
                ISNULL(MAX(Currency), 'ILS') AS Currency,
                COUNT(*) AS Count,
                ISNULL(SUM(CASE WHEN Status = 'paid'   THEN 1 ELSE 0 END), 0) AS PaidCount,
                ISNULL(SUM(CASE WHEN Status <> 'waived' THEN AmountMinor   ELSE 0 END), 0) AS GrossMinor,
                ISNULL(SUM(CASE WHEN Status = 'paid'   THEN AmountMinor   ELSE 0 END), 0) AS CollectedMinor,
                ISNULL(SUM(CASE WHEN Status = 'paid'   THEN ClubCutMinor  ELSE 0 END), 0) AS ClubCutMinor,
                ISNULL(SUM(CASE WHEN Status = 'paid'   THEN CoachNetMinor ELSE 0 END), 0) AS CoachNetMinor,
                ISNULL(SUM(CASE WHEN Status = 'owed'   THEN AmountMinor   ELSE 0 END), 0) AS OutstandingMinor
            FROM dbo.RidePayment
            WHERE SquadId = @squadId;
            """, new { squadId }, cancellationToken: ct));
    }

    public async Task<RidePayment?> MarkPaidAsync(Guid paymentId, Guid actorId, string method, string? note, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // Either party (rider or coach) may confirm the money changed hands. Waived rows are final.
        var updated = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.RidePayment
               SET Status = 'paid', Method = @method, PaidUtc = SYSDATETIMEOFFSET(),
                   Note = COALESCE(@note, Note)
             WHERE Id = @paymentId AND Status <> 'waived' AND (PayerId = @actorId OR CoachId = @actorId);
            """, new { paymentId, actorId, method = NormalizeMethod(method), note }, cancellationToken: ct));

        return updated == 0 ? null : await GetRow(conn, paymentId, ct);
    }

    public async Task<RidePayment?> WaiveAsync(Guid paymentId, Guid coachId, string? note, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        var updated = await conn.ExecuteAsync(new CommandDefinition("""
            UPDATE dbo.RidePayment
               SET Status = 'waived', PaidUtc = NULL, Note = COALESCE(@note, Note)
             WHERE Id = @paymentId AND CoachId = @coachId;
            """, new { paymentId, coachId, note }, cancellationToken: ct));

        return updated == 0 ? null : await GetRow(conn, paymentId, ct);
    }

    private static async Task<RidePayment?> GetRow(SqlConnection conn, Guid id, CancellationToken ct)
        => await conn.QuerySingleOrDefaultAsync<RidePayment>(new CommandDefinition(
            SelectRow + " WHERE p.Id = @id;", new { id }, cancellationToken: ct));

    private static async Task<bool> OwnsSquad(SqlConnection conn, Guid squadId, Guid ownerId, CancellationToken ct)
        => await conn.ExecuteScalarAsync<int>(new CommandDefinition(
            "SELECT CASE WHEN EXISTS (SELECT 1 FROM dbo.Squad WHERE Id=@squadId AND OwnerId=@ownerId) THEN 1 ELSE 0 END;",
            new { squadId, ownerId }, cancellationToken: ct)) == 1;

    private static string NormalizeKind(string? kind) => kind?.Trim().ToLowerInvariant() switch
    {
        "member" => "member",
        "coach" => "coach",
        _ => "dropin",
    };

    private static string NormalizeMethod(string? method) => method?.Trim().ToLowerInvariant() switch
    {
        "cash" => "cash",
        "link" => "link",
        "etransfer" or "e-transfer" or "transfer" => "etransfer",
        _ => "other",
    };
}
