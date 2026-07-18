// ===========================================================================
//  SqlRawActivityStore.cs   —   IRawActivityStore over SQL Server (Dapper).
//  TrySaveAsync is idempotent: a duplicate (Source, SourceExternalId) returns
//  false instead of throwing, so a re-uploaded identical file is a clean no-op.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

namespace Squad.Ingest.Data;

public sealed class SqlRawActivityStore(string connectionString) : IRawActivityStore
{
    public async Task<bool> TrySaveAsync(RawActivity raw, CancellationToken ct)
    {
        const string sql = """
            INSERT INTO dbo.RawActivity
                (Id, AthleteId, Source, SourceExternalId, Payload, ContentType, FileName, ReceivedUtc)
            VALUES
                (@Id, @AthleteId, @Source, @SourceExternalId, @Payload, @ContentType, @FileName, @ReceivedUtc);
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
                raw.Payload,
                raw.ContentType,
                raw.FileName,
                raw.ReceivedUtc,
            }, cancellationToken: ct));
            return true;
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            return false; // unique-index hit → already received, nothing to do
        }
    }

    public async Task<RawActivity?> GetAsync(Guid id, CancellationToken ct)
    {
        const string sql = """
            SELECT Id, AthleteId, Source, SourceExternalId, Payload, ContentType, FileName, ReceivedUtc
            FROM dbo.RawActivity
            WHERE Id = @id;
            """;

        await using var conn = new SqlConnection(connectionString);
        var row = await conn.QuerySingleOrDefaultAsync<Row>(
            new CommandDefinition(sql, new { id }, cancellationToken: ct));

        if (row is null) return null;

        return new RawActivity
        {
            Id = row.Id,
            AthleteId = row.AthleteId,
            Source = (ActivitySource)row.Source,
            SourceExternalId = row.SourceExternalId,
            Payload = row.Payload,
            ContentType = row.ContentType,
            FileName = row.FileName,
            ReceivedUtc = row.ReceivedUtc,
        };
    }

    // TINYINT comes back as byte; map to the enum in code. Dapper binds columns to
    // these constructor params by name.
    private sealed record Row(
        Guid Id, Guid AthleteId, byte Source, string? SourceExternalId,
        byte[] Payload, string ContentType, string? FileName, DateTimeOffset ReceivedUtc);
}
