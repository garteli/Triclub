// ===========================================================================
//  SqlActivityRepository.cs
//  The dedup lands here. Insert against the UNIQUE INDEX (AthleteId, Fingerprint);
//  on collision, replace only if the newcomer outranks the stored source. Summary
//  columns are indexed for leaderboards; the track is gzipped JSON in TrackBlob.
//
//  Reference implementation using Microsoft.Data.SqlClient + System.Text.Json.
//  Adapt to your DAL (EF Core / Dapper) — the SQL and the dedup rule are the point.
// ===========================================================================
using System;
using System.Data;
using System.IO;
using System.IO.Compression;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Data.SqlClient;

namespace Squad.Ingest;

public enum UpsertOutcome { Inserted, Replaced, DiscardedDuplicate }

public interface IActivityRepository
{
    Task<UpsertOutcome> UpsertByFingerprintAsync(Activity activity, int sourceRank, CancellationToken ct);
}

public sealed class SqlActivityRepository(string connectionString) : IActivityRepository
{
    public async Task<UpsertOutcome> UpsertByFingerprintAsync(Activity a, int sourceRank, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

        // Is there already a row for this athlete + fingerprint, and what's its rank?
        await using (var find = conn.CreateCommand())
        {
            find.CommandText = """
                SELECT TOP 1 Id, Source FROM dbo.Activity
                WHERE AthleteId = @athlete AND Fingerprint = @fp;
                """;
            find.Parameters.Add(new SqlParameter("@athlete", SqlDbType.UniqueIdentifier) { Value = a.AthleteId });
            find.Parameters.Add(new SqlParameter("@fp", SqlDbType.Char, 32) { Value = a.Fingerprint });

            await using var reader = await find.ExecuteReaderAsync(ct);
            if (await reader.ReadAsync(ct))
            {
                var existingId = reader.GetGuid(0);
                var existingRank = SourceRank.Of((ActivitySource)reader.GetByte(1));
                await reader.CloseAsync();

                if (sourceRank <= existingRank)
                    return UpsertOutcome.DiscardedDuplicate;   // stored copy is as good or richer

                await UpdateAsync(conn, existingId, a, ct);     // richer source → replace in place
                return UpsertOutcome.Replaced;
            }
        }

        try
        {
            await InsertAsync(conn, a, ct);
            return UpsertOutcome.Inserted;
        }
        catch (SqlException ex) when (ex.Number is 2601 or 2627)
        {
            // Lost a race against a concurrent insert of the same fingerprint — treat as dup.
            return UpsertOutcome.DiscardedDuplicate;
        }
    }

    private static async Task InsertAsync(SqlConnection conn, Activity a, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            INSERT INTO dbo.Activity
                (Id, AthleteId, Sport, StartUtc, MovingTimeSec, ElapsedTimeSec,
                 DistanceMeters, ElevationGainM, AvgHeartRate, MaxHeartRate,
                 AvgPowerWatts, AvgCadence, Calories, TrainingLoad,
                 Source, SourceExternalId, Fingerprint, TrackBlob)
            VALUES
                (@Id, @AthleteId, @Sport, @StartUtc, @MovingTimeSec, @ElapsedTimeSec,
                 @DistanceMeters, @ElevationGainM, @AvgHeartRate, @MaxHeartRate,
                 @AvgPowerWatts, @AvgCadence, @Calories, @TrainingLoad,
                 @Source, @SourceExternalId, @Fingerprint, @TrackBlob);
            """;
        Bind(cmd, a);
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task UpdateAsync(SqlConnection conn, Guid existingId, Activity a, CancellationToken ct)
    {
        await using var cmd = conn.CreateCommand();
        cmd.CommandText = """
            UPDATE dbo.Activity SET
                Sport = @Sport, StartUtc = @StartUtc,
                MovingTimeSec = @MovingTimeSec, ElapsedTimeSec = @ElapsedTimeSec,
                DistanceMeters = @DistanceMeters, ElevationGainM = @ElevationGainM,
                AvgHeartRate = @AvgHeartRate, MaxHeartRate = @MaxHeartRate,
                AvgPowerWatts = @AvgPowerWatts, AvgCadence = @AvgCadence,
                Calories = @Calories, TrainingLoad = @TrainingLoad,
                Source = @Source, SourceExternalId = @SourceExternalId,
                TrackBlob = @TrackBlob
            WHERE Id = @ExistingId;
            """;
        Bind(cmd, a);
        cmd.Parameters.Add(new SqlParameter("@ExistingId", SqlDbType.UniqueIdentifier) { Value = existingId });
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static void Bind(SqlCommand cmd, Activity a)
    {
        void P(string n, SqlDbType t, object? v) => cmd.Parameters.Add(new SqlParameter(n, t) { Value = v ?? DBNull.Value });

        P("@Id", SqlDbType.UniqueIdentifier, a.Id);
        P("@AthleteId", SqlDbType.UniqueIdentifier, a.AthleteId);
        P("@Sport", SqlDbType.TinyInt, (byte)a.Sport);
        P("@StartUtc", SqlDbType.DateTimeOffset, a.StartUtc);
        P("@MovingTimeSec", SqlDbType.Int, (int)a.MovingTime.TotalSeconds);
        P("@ElapsedTimeSec", SqlDbType.Int, (int)a.ElapsedTime.TotalSeconds);
        P("@DistanceMeters", SqlDbType.Float, a.DistanceMeters);
        P("@ElevationGainM", SqlDbType.Float, a.ElevationGainMeters);
        P("@AvgHeartRate", SqlDbType.Float, a.AvgHeartRate);
        P("@MaxHeartRate", SqlDbType.Float, a.MaxHeartRate);
        P("@AvgPowerWatts", SqlDbType.Float, a.AvgPowerWatts);
        P("@AvgCadence", SqlDbType.Float, a.AvgCadence);
        P("@Calories", SqlDbType.Float, a.Calories);
        P("@TrainingLoad", SqlDbType.Float, a.TrainingLoad);
        P("@Source", SqlDbType.TinyInt, (byte)a.Source);
        P("@SourceExternalId", SqlDbType.NVarChar, a.SourceExternalId);
        P("@Fingerprint", SqlDbType.Char, a.Fingerprint);
        P("@TrackBlob", SqlDbType.VarBinary, GzipTrack(a.Track));
    }

    // Track → gzipped JSON. Loaded and inflated only for map replay; never for leaderboards.
    private static object GzipTrack(System.Collections.Generic.IReadOnlyList<TrackPoint> track)
    {
        if (track.Count == 0) return DBNull.Value;
        using var outStream = new MemoryStream();
        using (var gzip = new GZipStream(outStream, CompressionLevel.Optimal, leaveOpen: true))
            JsonSerializer.Serialize(gzip, track);
        return outStream.ToArray();
    }
}
