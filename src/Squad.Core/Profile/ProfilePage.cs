// Profile-page ports + DTOs. Kept in the single Squad.Core namespace so hosts/infra
// need only `using Squad.Core;`. Everything here is derived from the athlete's real
// activities (or their one goal race) — no fabricated numbers.
namespace Squad.Core;

// ----- Goal race -----

/// <summary>The athlete's single goal race, shown as the Profile countdown card.
/// Date is an ISO 'yyyy-MM-dd' string (null when unknown). The event details are
/// extracted by the AI from <see cref="EventUrl"/> or entered manually.</summary>
public sealed record AthleteGoal(string Name, string? RaceDate, string? Location, string? EventUrl);

/// <summary>Persists the athlete's goal race (one row per athlete ⇒ upsert).</summary>
public interface IGoalStore
{
    Task<AthleteGoal?> GetAsync(Guid athleteId, CancellationToken ct);
    Task SetAsync(Guid athleteId, AthleteGoal goal, CancellationToken ct);
    Task ClearAsync(Guid athleteId, CancellationToken ct);
}

// ----- Race-info extraction (event URL → structured race) -----

/// <summary>What the AI pulls out of an event page: race name, ISO date, location.
/// Any field may be null when the page doesn't state it.</summary>
public sealed record RaceInfo(string? Name, string? Date, string? Location);

/// <summary>Outcome of extracting race info from a URL. On success <see cref="Race"/>
/// is populated; on failure <see cref="Error"/> explains why (unconfigured, unreachable
/// page, model error, nothing found).</summary>
public sealed record RaceInfoResult(bool Ok, RaceInfo? Race, string? Error)
{
    public static RaceInfoResult Success(RaceInfo race) => new(true, race, null);
    public static RaceInfoResult Fail(string error) => new(false, null, error);
}

/// <summary>Reads an event URL and asks an AI model to extract the race name / date /
/// location. <see cref="Configured"/> is false when no API key is set so the endpoint
/// can report an honest "not configured" instead of pretending.</summary>
public interface IRaceInfoService
{
    bool Configured { get; }
    Task<RaceInfoResult> ExtractAsync(string url, CancellationToken ct);
}

// ----- Profile page stats (all derived from activities) -----

/// <summary>One week of training volume, split by discipline (hours). Weeks are
/// Monday-based UTC; <see cref="WeekStart"/> is the ISO date of that Monday.</summary>
public sealed record WeekVolume(string WeekStart, double SwimHours, double BikeHours, double RunHours, double OtherHours);

/// <summary>One day on the fitness trend: CTL (chronic/fitness) and ATL (acute/fatigue),
/// exponentially-weighted from daily training load. Form (TSB) = CTL − ATL.</summary>
public sealed record FitnessPoint(string Date, double Ctl, double Atl);

/// <summary>Totals for one discipline over the training block: distance, moving hours, count.</summary>
public sealed record DisciplineTotal(string Sport, double DistanceKm, double Hours, int Count);

/// <summary>A personal best derived from activity summaries (e.g. longest ride, best
/// average power). Value is pre-formatted for display; Sport drives the accent colour.</summary>
public sealed record PersonalBest(string Label, string Value, string Unit, string Sport);

/// <summary>An earned badge computed from real milestones (activity count, streak, big week…).</summary>
public sealed record Achievement(string Title, string Sub, string Badge);

/// <summary>Everything the Profile page needs that comes from the athlete's activities
/// and social graph. Empty collections ⇒ the client omits that section (no fake fillers).</summary>
public sealed record ProfileStats(
    int Following,
    int Followers,
    int ActivityCount,
    double YearDistanceKm,
    double CtlNow,
    double AtlNow,
    double Tsb,
    double ThisWeekHours,
    double WeekHoursDelta,
    IReadOnlyList<WeekVolume> WeekVolumes,
    IReadOnlyList<FitnessPoint> Fitness,
    IReadOnlyList<DisciplineTotal> Disciplines,
    IReadOnlyList<PersonalBest> PersonalBests,
    IReadOnlyList<Achievement> Achievements);

/// <summary>Computes <see cref="ProfileStats"/> for an athlete from their activities.</summary>
public interface IProfileStatsService
{
    Task<ProfileStats> GetAsync(Guid athleteId, DateTimeOffset asOf, CancellationToken ct);
}
