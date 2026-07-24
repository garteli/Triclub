// ===========================================================================
//  SqlProfileService.cs  —  IProfileService over SQL Server (Dapper).
//  Reads/writes the athlete's editable profile columns on dbo.Athlete
//  (see Sql/Profile.sql). Update is a partial patch: COALESCE keeps existing
//  values where the incoming field is NULL.
// ===========================================================================
using System;
using System.Threading;
using System.Threading.Tasks;
using Dapper;
using Microsoft.Data.SqlClient;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlProfileService(string connectionString) : IProfileService
{
    public async Task<ProfileDetail?> GetAsync(Guid athleteId, CancellationToken ct)
    {
        const string sql = """
            SELECT Id, DisplayName AS Name, Initials, AvatarColor, Email, SquadId,
                   Club, AgeGroup, PrimarySport, Level, Ftp, WeeklyHours, Bio,
                   BirthDate, Gender, WeightKg,
                   EmergencyName, EmergencyPhone,
                   CASE WHEN AvatarBlob IS NOT NULL
                        THEN '/api/images/avatars/' + LOWER(CONVERT(varchar(36), Id)) END AS AvatarUrl,
                   HiddenFields
            FROM dbo.Athlete WHERE Id = @athleteId;
            """;
        await using var conn = new SqlConnection(connectionString);
        return await conn.QuerySingleOrDefaultAsync<ProfileDetail>(
            new CommandDefinition(sql, new { athleteId }, cancellationToken: ct));
    }

    public async Task<string?> GetAvatarBlobAsync(Guid athleteId, CancellationToken ct)
    {
        const string sql = "SELECT AvatarBlob FROM dbo.Athlete WHERE Id = @athleteId;";
        await using var conn = new SqlConnection(connectionString);
        return await conn.ExecuteScalarAsync<string?>(
            new CommandDefinition(sql, new { athleteId }, cancellationToken: ct));
    }

    public async Task SetAvatarBlobAsync(Guid athleteId, string? blobName, CancellationToken ct)
    {
        const string sql = "UPDATE dbo.Athlete SET AvatarBlob = @blobName WHERE Id = @athleteId;";
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new { athleteId, blobName }, cancellationToken: ct));
    }

    public async Task UpdateAsync(Guid athleteId, string? name, string? initials, ProfileUpdate f, CancellationToken ct)
    {
        // COALESCE(@x, Col): only overwrite columns whose incoming value is non-null.
        const string sql = """
            UPDATE dbo.Athlete SET
                DisplayName  = COALESCE(@name, DisplayName),
                Initials     = COALESCE(@initials, Initials),
                Club         = COALESCE(@Club, Club),
                AgeGroup     = COALESCE(@AgeGroup, AgeGroup),
                PrimarySport = COALESCE(@PrimarySport, PrimarySport),
                Level        = COALESCE(@Level, Level),
                Ftp          = COALESCE(@Ftp, Ftp),
                WeeklyHours  = COALESCE(@WeeklyHours, WeeklyHours),
                Bio          = COALESCE(@Bio, Bio),
                BirthDate    = COALESCE(@BirthDate, BirthDate),
                Gender       = COALESCE(@Gender, Gender),
                WeightKg     = COALESCE(@WeightKg, WeightKg),
                EmergencyName  = COALESCE(@EmergencyName, EmergencyName),
                EmergencyPhone = COALESCE(@EmergencyPhone, EmergencyPhone),
                -- HiddenFields is a full replacement (the client always sends the complete CSV,
                -- or "" to clear), so COALESCE lets null mean "leave as-is" and "" mean "nothing hidden".
                HiddenFields   = COALESCE(@HiddenFields, HiddenFields)
            WHERE Id = @athleteId;
            """;
        await using var conn = new SqlConnection(connectionString);
        await conn.ExecuteAsync(new CommandDefinition(sql, new
        {
            athleteId, name, initials,
            f.Club, f.AgeGroup, f.PrimarySport, f.Level, f.Ftp, f.WeeklyHours, f.Bio,
            f.BirthDate, f.Gender, f.WeightKg,
            f.EmergencyName, f.EmergencyPhone, f.HiddenFields,
        }, cancellationToken: ct));
    }
}
