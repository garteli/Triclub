// Dedup lands here: insert against UNIQUE (AthleteId, Fingerprint); on collision,
// replace only if the newcomer outranks the stored source. Summary columns are indexed;
// the track is gzipped JSON in TrackBlob. Reference impl using Microsoft.Data.SqlClient.
using System.Data;
using System.IO.Compression;
using System.Text.Json;
using Microsoft.Data.SqlClient;
using Squad.Core;

namespace Squad.Infrastructure;

public sealed class SqlActivityRepository(string connectionString) : IActivityRepository
{
    public async Task<UpsertOutcome> UpsertByFingerprintAsync(Activity a, int sourceRank, CancellationToken ct)
    {
        await using var conn = new SqlConnection(connectionString);
        await conn.OpenAsync(ct);

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

                if (sourceRank <= existingRank) return UpsertOutcome.DiscardedDuplicate;
                await UpdateAsync(conn, existingId, a, ct);
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
            return UpsertOutcome.DiscardedDuplicate; // lost a race with a concurrent insert
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
                 Source, SourceExternalId, Fingerprint, TrackBlob,
                 DeviceName, WeatherJson, StartLat, StartLon)
            VALUES
                (@Id, @AthleteId, @Sport, @StartUtc, @MovingTimeSec, @ElapsedTimeSec,
                 @DistanceMeters, @ElevationGainM, @AvgHeartRate, @MaxHeartRate,
                 @AvgPowerWatts, @AvgCadence, @Calories, @TrainingLoad,
                 @Source, @SourceExternalId, @Fingerprint, @TrackBlob,
                 @DeviceName, @WeatherJson, @StartLat, @StartLon);
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
                Source = @Source, SourceExternalId = @SourceExternalId, TrackBlob = @TrackBlob,
                DeviceName = @DeviceName, WeatherJson = @WeatherJson,
                StartLat = @StartLat, StartLon = @StartLon
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
        P("@TrackBlob", SqlDbType.VarBinary, GzipDetail(a.Track, a.Laps));
        P("@DeviceName", SqlDbType.NVarChar, a.DeviceName);
        P("@WeatherJson", SqlDbType.NVarChar, a.Weather is null ? null : JsonSerializer.Serialize(a.Weather));
        // StartLat/StartLon denormalize the first GPS point so the matched-rides query can
        // seek on start position without decompressing every TrackBlob.
        var start = a.Track.Count > 0 ? a.Track[0] : null;
        P("@StartLat", SqlDbType.Float, start?.Lat);
        P("@StartLon", SqlDbType.Float, start?.Lon);
    }

    // Gzipped JSON of the detail payload (track + laps). Format v2 is an ActivityDetail
    // object; v1 (pre-laps) was a bare TrackPoint[] — the read side handles both. Column
    // stays TrackBlob, so no schema change.
    private static object GzipDetail(IReadOnlyList<TrackPoint> track, IReadOnlyList<Lap> laps)
    {
        if (track.Count == 0 && laps.Count == 0) return DBNull.Value;
        using var outStream = new MemoryStream();
        using (var gzip = new GZipStream(outStream, CompressionLevel.Optimal, leaveOpen: true))
            JsonSerializer.Serialize(gzip, new ActivityDetail(track, laps));
        return outStream.ToArray();
    }
}
