using System;

namespace Squad.Ingest.Feed;

/// <summary>
/// What a squad member's client renders as a feed card. The canonical <see cref="Activity"/>
/// only carries an AthleteId, so the fan-out enriches it with display fields via
/// <see cref="IAthleteDirectory"/> and pre-formats the human-readable strings server-side
/// (one place to keep EN/HE + units consistent).
/// </summary>
public sealed record ActivityFeedItem
{
    public Guid Id { get; init; }
    public Guid AthleteId { get; init; }
    public string AthleteName { get; init; } = "";
    public string Initials { get; init; } = "";
    public string AvatarColor { get; init; } = "#d6ff3f";

    public string Sport { get; init; } = "";        // "Bike" | "Run" | "Swim" | "Other"
    public string Icon { get; init; } = "";          // emoji used on the card
    public string DiscColor { get; init; } = "";     // css var for the sport chip
    public string Action { get; init; } = "";        // "rode 42.1 km"
    public string Metric { get; init; } = "";        // "1:14 · 82 TSS"
    public DateTimeOffset StartUtc { get; init; }
    public int Reacts { get; init; }
}

/// <summary>
/// Resolves an athlete's display info and which squad they belong to. Implement against
/// your athlete/team store (EF/Dapper). Kept as an interface so the fan-out stays testable
/// and source-blind.
/// </summary>
public interface IAthleteDirectory
{
    Task<AthleteProfile?> GetAsync(Guid athleteId, CancellationToken ct);
}

public sealed record AthleteProfile(Guid Id, string Name, string Initials, string AvatarColor, Guid SquadId);
