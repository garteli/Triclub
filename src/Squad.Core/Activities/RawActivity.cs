namespace Squad.Core;

/// <summary>
/// The original payload exactly as a collection surface produced it, plus the
/// who/where metadata. This is all a surface is responsible for — a per-source
/// adapter turns it into the canonical <see cref="Activity"/>.
/// </summary>
public sealed record RawActivity
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public Guid AthleteId { get; init; }
    public ActivitySource Source { get; init; }

    /// <summary>
    /// The source's own id for this activity (Garmin activityId, HealthKit uuid,
    /// upload filename hash, ...). Combined with <see cref="Source"/> this is the
    /// idempotency key — a retried webhook/upload must not double-process.
    /// </summary>
    public string? SourceExternalId { get; init; }

    /// <summary>MIME-ish hint the adapter uses to pick a decoder: "fit","gpx","tcx","json".</summary>
    public string PayloadKind { get; init; } = "json";

    /// <summary>The raw bytes: a .FIT/.GPX/.TCX file, or the companion app's JSON.</summary>
    public byte[] Payload { get; init; } = [];

    /// <summary>The group event (SquadEvent) this ride was recorded for, when the athlete started
    /// it from a scheduled ride — carried through ingest onto the committed <see cref="Activity"/>.</summary>
    public Guid? EventId { get; init; }

    public DateTimeOffset ReceivedUtc { get; init; } = DateTimeOffset.UtcNow;
}
