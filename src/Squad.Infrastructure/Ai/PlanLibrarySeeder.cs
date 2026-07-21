using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// Populates the plan library by AI-generating any missing templates from <see cref="PlanCatalog"/>.
/// Runs once on startup, gated by config (PlanLibrary:Seed=true) and a per-run limit
/// (PlanLibrary:SeedLimit) so the rollout can be verified a few plans at a time before generating all 30.
/// Idempotent: skips (distance, level) pairs that already exist, so re-runs only fill gaps. Sequential and
/// off the request thread, so each generation has no request-timeout ceiling.
/// </summary>
public sealed class PlanLibrarySeeder : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PlanLibrarySeeder> _log;
    private readonly bool _enabled;
    private readonly int _limit;

    public PlanLibrarySeeder(IServiceScopeFactory scopes, ILogger<PlanLibrarySeeder> log, bool enabled, int limit)
    {
        _scopes = scopes;
        _log = log;
        _enabled = enabled;
        _limit = limit <= 0 ? int.MaxValue : limit;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_enabled) return;

        // Let the app finish warming before hammering the AI.
        try { await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken); }
        catch (OperationCanceledException) { return; }

        int made = 0, order = 0;
        _log.LogInformation("PlanLibrarySeeder starting (limit {Limit}, catalog {Count})", _limit, PlanCatalog.All.Count);

        foreach (var spec in PlanCatalog.All)
        {
            order++;
            if (stoppingToken.IsCancellationRequested || made >= _limit) break;

            try
            {
                using var scope = _scopes.CreateScope();
                var store = scope.ServiceProvider.GetRequiredService<IPlanTemplateStore>();
                if (await store.ExistsAsync(spec.Distance, spec.Level, stoppingToken))
                    continue;

                var importer = scope.ServiceProvider.GetRequiredService<IPlanImportService>();
                if (!importer.Configured) { _log.LogWarning("PlanLibrarySeeder: AI not configured; stopping."); return; }

                _log.LogInformation("PlanLibrarySeeder generating {Title}…", spec.Title);
                var result = await importer.GeneratePlanAsync(spec, stoppingToken);
                if (!result.Ok || result.Doc is null)
                {
                    _log.LogWarning("PlanLibrarySeeder: {Key} failed: {Error}", spec.Key, result.Error);
                    continue;
                }

                await store.UpsertAsync(new PlanTemplate(
                    Guid.NewGuid(), spec.Distance, spec.Level, spec.GoalLabel,
                    result.Name ?? spec.Title, spec.Weeks, order, result.Doc, DateTimeOffset.UtcNow), stoppingToken);
                made++;
                _log.LogInformation("PlanLibrarySeeder stored {Title} ({Made} this run)", spec.Title, made);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "PlanLibrarySeeder: {Key} errored", spec.Key);
            }
        }

        _log.LogInformation("PlanLibrarySeeder done — generated {Made} template(s) this run.", made);
    }
}
