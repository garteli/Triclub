using System;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading.Channels;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// In-memory <see cref="IPlanImportQueue"/>: a job store (ConcurrentDictionary) fronting an
/// unbounded channel the <see cref="PlanImportWorker"/> drains. Single instance / Always-On, so
/// in-memory is fine; a job only lives a few minutes. Jobs older than <see cref="Ttl"/> are pruned
/// on submit. If the app restarts mid-job the job is lost and the client's poll 404s → it shows a
/// retry-able error, which is acceptable for a best-effort import.
/// </summary>
public sealed class PlanImportQueue : IPlanImportQueue
{
    private static readonly TimeSpan Ttl = TimeSpan.FromMinutes(30);

    private readonly ConcurrentDictionary<Guid, PlanImportJob> _jobs = new();
    private readonly Channel<PlanImportRequest> _channel =
        Channel.CreateUnbounded<PlanImportRequest>(new UnboundedChannelOptions { SingleReader = true });
    private readonly bool _configured;

    public PlanImportQueue(bool configured) => _configured = configured;

    public bool Configured => _configured;

    /// <summary>Drained by the hosted worker.</summary>
    internal ChannelReader<PlanImportRequest> Reader => _channel.Reader;

    public PlanImportJob Submit(Guid ownerId, byte[] pdf, string fileName, string anchorType, string? anchorDate)
    {
        Prune();
        var job = new PlanImportJob(Guid.NewGuid(), ownerId, PlanImportState.Pending, null, null, null, DateTimeOffset.UtcNow);
        _jobs[job.Id] = job;
        // Unbounded channel + synchronous write always succeeds.
        _channel.Writer.TryWrite(new PlanImportRequest(job.Id, ownerId, pdf, fileName, anchorType, anchorDate));
        return job;
    }

    public PlanImportJob? Get(Guid ownerId, Guid jobId) =>
        _jobs.TryGetValue(jobId, out var job) && job.OwnerId == ownerId ? job : null;

    // ----- worker-facing state transitions (same assembly) -----

    internal void SetRunning(Guid jobId) => Mutate(jobId, j => j with { State = PlanImportState.Running });

    internal void SetDone(Guid jobId, Guid planId, string name) =>
        Mutate(jobId, j => j with { State = PlanImportState.Done, PlanId = planId, Name = name });

    internal void SetError(Guid jobId, string error) =>
        Mutate(jobId, j => j with { State = PlanImportState.Error, Error = error });

    private void Mutate(Guid jobId, Func<PlanImportJob, PlanImportJob> f)
    {
        // Atomic swap; ignore if the job was pruned out from under us.
        if (_jobs.TryGetValue(jobId, out var cur)) _jobs[jobId] = f(cur);
    }

    private void Prune()
    {
        var cutoff = DateTimeOffset.UtcNow - Ttl;
        foreach (var kv in _jobs.Where(kv => kv.Value.CreatedUtc < cutoff).ToList())
            _jobs.TryRemove(kv.Key, out _);
    }
}
