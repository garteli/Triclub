namespace Squad.Core;

/// <summary>
/// One day of lightweight wellness for an athlete — the readiness/recovery signals
/// imported from Apple Health (resting HR, HRV, respiratory rate, weight, VO2max, sleep).
/// This is deliberately NOT an <see cref="Activity"/>: no fingerprint, no feed fan-out,
/// no GPS. Activities come from Garmin/FIT; this is the "how's the body today" layer.
/// Every metric is nullable — a day carries only what the device actually recorded, and
/// the store COALESCEs on upsert so a later partial sync never clears an earlier value.
/// </summary>
public sealed record HealthDailyRecord(
    Guid AthleteId,
    DateOnly Day,
    double? RestingHr,        // bpm
    double? HrvMs,            // heart-rate variability SDNN, milliseconds
    double? RespiratoryRate,  // breaths per minute
    double? WeightKg,         // kilograms
    double? Vo2Max,           // mL/(kg·min)
    double? SleepHours);      // total asleep hours for the night ending that day

/// <summary>Upsert + read the per-athlete daily wellness table.</summary>
public interface IHealthDailyStore
{
    /// <summary>Insert or merge one day. Each non-null metric overwrites; nulls leave the
    /// stored value intact (COALESCE), so re-syncing and partial syncs are non-destructive.</summary>
    Task UpsertAsync(HealthDailyRecord day, CancellationToken ct);

    /// <summary>The athlete's own days in [from, to] (inclusive), newest first.</summary>
    Task<IReadOnlyList<HealthDailyRecord>> GetRangeAsync(
        Guid athleteId, DateOnly from, DateOnly to, CancellationToken ct);
}
