using System;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Ingest;

/// <summary>
/// The untouched payload as it arrived, plus who/where it came from. The intake
/// endpoint writes one of these and returns immediately; the worker reads it back
/// and hands it to the matching <see cref="ISourceAdapter"/>. Keeping the raw bytes
/// means a parser bug is replayable — you never lose the original.
/// </summary>
public sealed record RawActivity
{
    public Guid Id { get; init; }
    public Guid AthleteId { get; init; }
    public ActivitySource Source { get; init; }

    /// <summary>
    /// Stable per physical payload. For uploads we use the SHA-256 of the file bytes
    /// so a re-uploaded identical file is idempotent at the raw layer; for webhooks
    /// it's the provider's activity id. Unique with <see cref="Source"/>.
    /// </summary>
    public string? SourceExternalId { get; init; }

    public byte[] Payload { get; init; } = [];
    public string ContentType { get; init; } = "application/octet-stream";
    public string? FileName { get; init; }
    public DateTimeOffset ReceivedUtc { get; init; }
}

public interface IRawActivityStore
{
    /// <summary>Persists the raw payload. Returns false if (Source, SourceExternalId) already exists (idempotent no-op).</summary>
    Task<bool> TrySaveAsync(RawActivity raw, CancellationToken ct);
    Task<RawActivity?> GetAsync(Guid id, CancellationToken ct);
}
