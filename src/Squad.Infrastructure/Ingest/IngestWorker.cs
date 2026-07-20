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
        activity = await EnrichWeatherAsync(sp, activity, ct);
        var outcome = await repo.UpsertByFingerprintAsync(activity, SourceRank.Of(activity.Source), ct);

        log.LogInformation("Ingest {Outcome}: athlete {Athlete} {Sport} {Start:o} [{Source}]",
            outcome, activity.AthleteId, activity.Sport, activity.StartUtc, activity.Source);

        if (outcome is UpsertOutcome.Inserted or UpsertOutcome.Replaced && fanout is not null)
            await fanout.OnActivityCommittedAsync(activity, ct);
    }

    // Best-effort: look up the weather at the ride's start point + time and attach it. Outdoor
    // activities only (a GPS start point); indoor sessions have no track and stay null. Any
    // failure (no weather service, network, no data) leaves the activity unchanged.
    private static async Task<Activity> EnrichWeatherAsync(IServiceProvider sp, Activity activity, CancellationToken ct)
    {
        if (activity.Weather is not null || activity.Track.Count == 0) return activity;

        var weather = sp.GetService<IWeatherService>();
        if (weather is null) return activity;

        var start = activity.Track[0];
        var reading = await weather.GetAsync(start.Lat, start.Lon, activity.StartUtc, ct);
        return reading is null ? activity : activity with { Weather = reading };
    }
}
