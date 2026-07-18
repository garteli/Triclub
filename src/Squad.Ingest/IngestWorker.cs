// ===========================================================================
//  IngestWorker.cs
//  Drains the queue, resolves the adapter by Source, normalizes, dedups, persists.
//  This is the piece that makes the slice run end-to-end; it was described in the
//  spec's §6 and is included here so an uploaded .FIT actually becomes an Activity.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace Squad.Ingest;

public sealed class IngestWorker(
    IIngestQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<IngestWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var rawId in queue.DequeueAllAsync(stoppingToken))
        {
            try
            {
                await ProcessAsync(rawId, stoppingToken);
            }
            catch (Exception ex)
            {
                // Never let one bad file kill the worker. The RawActivity is retained,
                // so this id can be replayed after a parser fix.
                log.LogError(ex, "Ingest failed for RawActivity {RawId}", rawId);
            }
        }
    }

    private async Task ProcessAsync(Guid rawId, CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sp = scope.ServiceProvider;

        var store = sp.GetRequiredService<IRawActivityStore>();
        var repo = sp.GetRequiredService<IActivityRepository>();
        var adapters = sp.GetRequiredService<IEnumerable<ISourceAdapter>>();
        var fanout = sp.GetService<IActivityFanout>();

        var raw = await store.GetAsync(rawId, ct);
        if (raw is null) { log.LogWarning("RawActivity {RawId} vanished", rawId); return; }

        var adapter = adapters.FirstOrDefault(a => a.Source == raw.Source)
            ?? throw new InvalidOperationException($"No adapter registered for source {raw.Source}");

        Activity activity = await adapter.NormalizeAsync(raw, ct);

        // Dedup: unique index on (AthleteId, Fingerprint). Insert wins if new; on
        // collision, replace only when the incoming source outranks the stored one.
        var outcome = await repo.UpsertByFingerprintAsync(activity, SourceRank.Of(activity.Source), ct);

        log.LogInformation("Ingest {Outcome}: athlete {Athlete} {Sport} {Start:o} [{Source}]",
            outcome, activity.AthleteId, activity.Sport, activity.StartUtc, activity.Source);

        // Only a genuinely new/updated activity should touch leaderboards or the feed.
        if (outcome is UpsertOutcome.Inserted or UpsertOutcome.Replaced && fanout is not null)
            await fanout.OnActivityCommittedAsync(activity, ct);
    }
}

/// <summary>Post-commit fan-out (leaderboard aggregates + SignalR push). Optional here.</summary>
public interface IActivityFanout
{
    Task OnActivityCommittedAsync(Activity activity, CancellationToken ct);
}
