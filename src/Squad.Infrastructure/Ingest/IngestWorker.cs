using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>Drains the queue, resolves the adapter by Source, normalizes, dedups, persists, fans out.</summary>
public sealed class IngestWorker(
    IIngestQueue queue,
    IServiceScopeFactory scopeFactory,
    ILogger<IngestWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var rawId in queue.DequeueAllAsync(stoppingToken))
        {
            try { await ProcessAsync(rawId, stoppingToken); }
            catch (Exception ex) { log.LogError(ex, "Ingest failed for RawActivity {RawId}", rawId); }
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

        var activity = await adapter.NormalizeAsync(raw, ct);
        var outcome = await repo.UpsertByFingerprintAsync(activity, SourceRank.Of(activity.Source), ct);

        log.LogInformation("Ingest {Outcome}: athlete {Athlete} {Sport} {Start:o} [{Source}]",
            outcome, activity.AthleteId, activity.Sport, activity.StartUtc, activity.Source);

        if (outcome is UpsertOutcome.Inserted or UpsertOutcome.Replaced && fanout is not null)
            await fanout.OnActivityCommittedAsync(activity, ct);
    }
}
