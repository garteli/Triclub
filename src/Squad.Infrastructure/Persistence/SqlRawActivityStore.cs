// IRawActivityStore over SQL Server (Dapper). TrySaveAsync is idempotent: a duplicate
// (Source, SourceExternalId) returns false instead of throwing.
using Dapper;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlRawActivityStore(string connectionString) : IRawActivityStore
{
    public async Task<bool> TrySaveAsync(RawActivity raw, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.RawActivity
                (Id, AthleteId, Source, SourceExternalId, PayloadKind, Payload, ReceivedUtc)
            VALUES
                (@Id, @AthleteId, @Source, @SourceExternalId, @PayloadKind, @Payload, @ReceivedUtc);
            """;

        await using var conn = new SqlConnection(connectionString);
        try
        {
            await conn.ExecuteAsync(new CommandDefinition(sql, new
            {
                raw.Id,
                raw.AthleteId,
                Source = (byte)raw.Source,
                raw.SourceExternalId,
                raw.PayloadKind,
                raw.Payload,
                raw.ReceivedUtc,
            }, cancellationToken: ct));
            return true;
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return false; // already received
        }
    }

    public async Task<RawActivity?> GetAsync(Guid id, CancellationToken ct)
    {
        const string sql = """
            SELECT Id, AthleteId, Source, SourceExternalId, PayloadKind, Payload, ReceivedUtc
            FROM dbo.RawActivity WHERE Id = @id;
            """;

        await using var conn = new SqlConnection(connectionString);
        var row = await conn.QuerySingleOrDefaultAsync<Row>(new CommandDefinition(sql, new { id }, cancellationToken: ct));
        if (row is null) return null;

        return new RawActivity
        {
            Id = row.Id,
            AthleteId = row.AthleteId,
            Source = (ActivitySource)row.Source,
            SourceExternalId = row.SourceExternalId,
            PayloadKind = row.PayloadKind,
            Payload = row.Payload,
            ReceivedUtc = row.ReceivedUtc,
        };
    }

    private sealed record Row(
        Guid Id, Guid AthleteId, byte Source, string? SourceExternalId,
        string PayloadKind, byte[] Payload, DateTimeOffset ReceivedUtc);
}
