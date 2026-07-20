// ===========================================================================
//  SqlAthleteDirectory.cs   —   IAthleteDirectory over SQL Server (Dapper).
//  Resolves the display fields the feed card needs plus the athlete's SquadId
//  (used to target the SignalR group). Hit on every commit and every hub
//  connect, so wrap with IMemoryCache if profiles are read-heavy — they rarely change.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlAthleteDirectory(string connectionString) : IAthleteDirectory
{
    public async Task<AthleteProfile?> GetAsync(Guid athleteId, CancellationToken ct)
    {
        // Column aliases map to AthleteProfile's constructor params. Adjust the
        // source column names if your Athlete table differs (see Sql/RawActivity.sql).
        const string sql = """
            SELECT Id, DisplayName AS Name, Initials, AvatarColor, SquadId,
                   CASE WHEN AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), Id)) END AS AvatarUrl
            FROM dbo.Athlete
            WHERE Id = @athleteId;
            """;

        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<AthleteProfile>(
            new CommandDefinition(sql, new { athleteId }, cancellationToken: ct));
    }
}
