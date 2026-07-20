// ===========================================================================
//  HealthDailyDto.cs
//  The JSON the iOS app POSTs to /api/health/daily — lightweight daily wellness
//  (resting HR, HRV, respiratory rate, weight, VO2max, sleep). The device does the
//  HealthKit → daily reduction; the backend just maps 1:1 and upserts by (athlete, day).
//  Deliberately separate from NativeActivityDto: this is NOT an activity.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Globalization;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed record HealthDailyBatchDto
{
    public List<HealthDailyDayDto> Days { get; init; } = [];
}

public sealed record HealthDailyDayDto
{
    /// <summary>Local calendar day, ISO "yyyy-MM-dd".</summary>
    public string Date { get; init; } = "";

    public double? RestingHr { get; init; }
    public double? HrvMs { get; init; }
    public double? RespiratoryRate { get; init; }
    public double? WeightKg { get; init; }
    public double? Vo2Max { get; init; }
    public double? SleepHours { get; init; }
}

public static class HealthDailyMapper
{
    /// <summary>Map one posted day to the domain record. Returns false if the date is
    /// unparseable or the day has no metric at all (nothing worth storing).</summary>
    public static bool TryToRecord(HealthDailyDayDto d, Guid athleteId, out HealthDailyRecord record)
    {
        record = default!;
        if (!DateOnly.TryParseExact(d.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
            return false;

        var anyMetric = d.RestingHr is not null || d.HrvMs is not null || d.RespiratoryRate is not null
            || d.WeightKg is not null || d.Vo2Max is not null || d.SleepHours is not null;
        if (!anyMetric) return false;

        record = new HealthDailyRecord(
            athleteId, day,
            RestingHr: Clean(d.RestingHr),
            HrvMs: Clean(d.HrvMs),
            RespiratoryRate: Clean(d.RespiratoryRate),
            WeightKg: Clean(d.WeightKg),
            Vo2Max: Clean(d.Vo2Max),
            SleepHours: Clean(d.SleepHours));
        return true;
    }

    // Drop NaN/Infinity/negative sentinels — treat them as "not recorded".
    private static double? Clean(double? v)
        => v is double n && double.IsFinite(n) && n >= 0 ? n : null;
}
