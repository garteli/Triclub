// ===========================================================================
//  FitUploadAdapter.cs   —  the .FIT → canonical Activity path.
//  Requires:  dotnet add package Garmin.FIT.Sdk   (namespace Dynastream.Fit)
//
//  Two gotchas this handles that silently corrupt naive parsers:
//   1. Positions are SEMICIRCLES, not degrees:  deg = semicircles * 180 / 2^31.
//   2. FIT timestamps are seconds since 1989-12-31 UTC. The SDK's DateTime wraps
//      that; .GetDateTime() gives a UTC System.DateTime, which is what we use.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Dynastream.Fit;

namespace Squad.Ingest;

public sealed class FitParseException(string message) : Exception(message);

public sealed class FitUploadAdapter : ISourceAdapter
{
    public ActivitySource Source => ActivitySource.FitUpload;

    // semicircles -> degrees
    private const double SemicircleToDeg = 180.0 / 2147483648.0; // 180 / 2^31

    public Task<Activity> NormalizeAsync(RawActivity raw, CancellationToken ct)
    {
        var (session, records) = DecodeFit(raw.Payload);
        if (session is null)
            throw new FitParseException("FIT file contained no Session message — cannot summarize.");

        // ----- session start (t0 for track offsets) -----
        DateTime startUtc = session.GetStartTime()?.GetDateTime()
            ?? throw new FitParseException("Session has no start time.");
        var start = new DateTimeOffset(DateTime.SpecifyKind(startUtc, DateTimeKind.Utc));

        // ----- summary metrics (all nullable = not captured) -----
        double? distance = session.GetTotalDistance();               // metres
        ActivitySport sport = MapSport(session.GetSport());
        var movingTime = TimeSpan.FromSeconds(session.GetTotalTimerTime() ?? 0);
        var elapsedTime = TimeSpan.FromSeconds(session.GetTotalElapsedTime() ?? session.GetTotalTimerTime() ?? 0);

        // ----- track -----
        var track = BuildTrack(records, start);

        var activity = new Activity
        {
            Id = Guid.NewGuid(),
            AthleteId = raw.AthleteId,
            Sport = sport,
            StartUtc = start,
            MovingTime = movingTime,
            ElapsedTime = elapsedTime,
            DistanceMeters = distance,
            ElevationGainMeters = session.GetTotalAscent(),          // metres (ushort)
            AvgHeartRate = session.GetAvgHeartRate(),
            MaxHeartRate = session.GetMaxHeartRate(),
            AvgPowerWatts = session.GetAvgPower(),
            AvgCadence = session.GetAvgCadence(),
            Calories = session.GetTotalCalories(),
            TrainingLoad = session.GetTrainingStressScore(),         // TSS if the head unit wrote it; else null
            Source = Source,
            SourceExternalId = raw.SourceExternalId,
            Track = track,
            // Fingerprint is derived from the normalized summary, so it matches every
            // other source reporting the same physical activity.
            Fingerprint = Squad.Ingest.Fingerprint.Compute(sport, start, distance),
        };

        return Task.FromResult(activity);
    }

    // -------------------------------------------------------------------
    //  FIT decode — accumulate Session + Record messages.
    //  Multisport (triathlon) files can carry several sessions; MVP takes the
    //  first. TODO: split multisport into one Activity per child session.
    // -------------------------------------------------------------------
    private static (SessionMesg? session, List<RecordMesg> records) DecodeFit(byte[] bytes)
    {
        var sessions = new List<SessionMesg>();
        var records = new List<RecordMesg>();

        var decode = new Decode();
        var broadcaster = new MesgBroadcaster();
        decode.MesgEvent += broadcaster.OnMesg;
        decode.MesgDefinitionEvent += broadcaster.OnMesgDefinition;
        broadcaster.SessionMesgEvent += (_, e) => sessions.Add((SessionMesg)e.mesg);
        broadcaster.RecordMesgEvent += (_, e) => records.Add((RecordMesg)e.mesg);

        using var ms = new MemoryStream(bytes, writable: false);
        if (!decode.IsFIT(ms))
            throw new FitParseException("Not a FIT file (header check failed).");
        ms.Position = 0;

        try
        {
            decode.Read(ms);
        }
        catch (FitException ex)
        {
            // A truncated tail still yields the messages read so far; only bail if we got nothing.
            if (sessions.Count == 0)
                throw new FitParseException($"FIT decode failed: {ex.Message}");
        }

        return (sessions.Count > 0 ? sessions[0] : null, records);
    }

    private static IReadOnlyList<TrackPoint> BuildTrack(List<RecordMesg> records, DateTimeOffset start)
    {
        var track = new List<TrackPoint>(records.Count);
        foreach (var r in records)
        {
            int? latSc = r.GetPositionLat();
            int? lonSc = r.GetPositionLong();
            if (latSc is null || lonSc is null)
                continue; // indoor/pool records with no GPS — skip from the map track

            DateTime? tsUtc = r.GetTimestamp()?.GetDateTime();
            int offsetSec = tsUtc is null
                ? 0
                : (int)(new DateTimeOffset(DateTime.SpecifyKind(tsUtc.Value, DateTimeKind.Utc)) - start).TotalSeconds;

            track.Add(new TrackPoint(
                Lat: latSc.Value * SemicircleToDeg,
                Lon: lonSc.Value * SemicircleToDeg,
                ElevM: r.GetEnhancedAltitude() ?? r.GetAltitude(),
                OffsetSec: offsetSec,
                HeartRate: r.GetHeartRate(),
                PowerW: r.GetPower(),
                Cadence: r.GetCadence(),
                SpeedMps: r.GetEnhancedSpeed() ?? r.GetSpeed()));
        }
        return track;
    }

    private static ActivitySport MapSport(Sport? sport) => sport switch
    {
        Sport.Cycling  => ActivitySport.Bike,
        Sport.Running  => ActivitySport.Run,
        Sport.Swimming => ActivitySport.Swim,
        _              => ActivitySport.Other,
    };
}
