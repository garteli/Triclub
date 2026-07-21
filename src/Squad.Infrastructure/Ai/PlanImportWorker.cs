using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// Drains <see cref="PlanImportQueue"/> one job at a time (sequential — keeps memory/CPU sane on a
/// small plan) and runs each import off the request thread: call the AI, normalise, save a new
/// CoachPlan, and record the outcome on the job for the client's poll. Because it's not inside an
/// HTTP request, a slow multi-week extraction has no request-timeout ceiling.
/// </summary>
public sealed class PlanImportWorker : BackgroundService
{
    private readonly PlanImportQueue _queue;
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<PlanImportWorker> _log;

    public PlanImportWorker(PlanImportQueue queue, IServiceScopeFactory scopes, ILogger<PlanImportWorker> log)
    {
        _queue = queue;
        _scopes = scopes;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var req in _queue.Reader.ReadAllAsync(stoppingToken))
        {
            try
            {
                _queue.SetRunning(req.JobId);

                using var scope = _scopes.CreateScope();
                var importer = scope.ServiceProvider.GetRequiredService<IPlanImportService>();
                var plans = scope.ServiceProvider.GetRequiredService<IPlanService>();

                var result = await importer.ImportAsync(req.Pdf, req.FileName, req.AnchorType, req.AnchorDate, stoppingToken);
                if (!result.Ok || result.Doc is null)
                {
                    _queue.SetError(req.JobId, result.Error ?? "Couldn't import that plan.");
                    continue;
                }

                var name = (result.Name ?? "Imported plan").Trim();
                if (name.Length == 0) name = "Imported plan";
                if (name.Length > 120) name = name[..120];

                var id = await plans.SavePlanAsync(req.OwnerId, null, name, result.Doc, null, stoppingToken);
                if (id is { } planId) _queue.SetDone(req.JobId, planId, name);
                else _queue.SetError(req.JobId, "Couldn't save the imported plan.");
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                // App shutting down — leave the job as-is; the client will surface a timeout.
                break;
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Plan import job {JobId} failed", req.JobId);
                _queue.SetError(req.JobId, "Something went wrong importing that plan. Try again.");
            }
        }
    }
}
