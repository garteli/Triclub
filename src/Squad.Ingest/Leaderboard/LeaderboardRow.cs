using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Ingest.Leaderboard;

/// <summary>
/// One athlete's standing for the current squad week. Metric definitions (documented
/// here because they're product decisions, not givens):
///   Load        = Σ TrainingLoad (TSS) this week
///   VolumeHours = Σ MovingTime this week, in hours
///   Swim/Bike/RunLoad = Σ TrainingLoad this week for that discipline
///   Streak      = consecutive days (ending today, or yesterday if today is still empty)
///                 with ≥1 activity — a rolling stat, not weekly-windowed
///   Move        = change in the athlete's LOAD rank vs last week (+ = climbed)
/// The client sorts by whichever tab is active, so every metric ships in one payload.
/// </summary>
public sealed record LeaderboardRow
{
    public Guid AthleteId { get; init; }
    public string Name { get; init; } = "";
    public string Initials { get; init; } = "";
    public string Color { get; init; } = "#d6ff3f";
    public bool You { get; init; }

    public double Load { get; init; }
    public double VolumeHours { get; init; }
    public int Streak { get; init; }
    public double SwimLoad { get; init; }
    public double BikeLoad { get; init; }
    public double RunLoad { get; init; }
    public int Move { get; init; }
}

public interface ILeaderboardService
{
    Task<IReadOnlyList<LeaderboardRow>> GetWeeklyAsync(Guid squadId, Guid? me, DateTimeOffset asOf, CancellationToken ct);
}
