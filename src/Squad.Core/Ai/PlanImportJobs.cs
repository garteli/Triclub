using System;

namespace Squad.Core;

/// <summary>Lifecycle of an async PDF-plan import.</summary>
public enum PlanImportState { Pending, Running, Done, Error }

/// <summary>A submitted PDF-import job the client polls until it's done. Immutable snapshot —
/// the queue swaps a new record in as the state advances.</summary>
public sealed record PlanImportJob(
    Guid Id, Guid OwnerId, PlanImportState State, Guid? PlanId, string? Name, string? Error, DateTimeOffset CreatedUtc);

/// <summary>The work item a submitted job carries into the background worker.</summary>
public sealed record PlanImportRequest(
    Guid JobId, Guid OwnerId, byte[] Pdf, string FileName, string AnchorType, string? AnchorDate);

/// <summary>
/// Accepts a PDF-plan import and runs it OUT of the HTTP request, so a slow multi-week
/// extraction isn't bound by the platform's request timeout. The endpoint submits and returns
/// a job id immediately; the client polls <see cref="Get"/> until the job reaches Done/Error.
/// </summary>
public interface IPlanImportQueue
{
    /// <summary>Whether AI import is configured (mirrors <see cref="IPlanImportService.Configured"/>),
    /// so the endpoint can report an honest "not set up" without constructing a job.</summary>
    bool Configured { get; }

    /// <summary>Create a Pending job for <paramref name="ownerId"/> and enqueue it for processing.</summary>
    PlanImportJob Submit(Guid ownerId, byte[] pdf, string fileName, string anchorType, string? anchorDate);

    /// <summary>The owner's job by id, or null if unknown / not theirs / expired.</summary>
    PlanImportJob? Get(Guid ownerId, Guid jobId);
}
