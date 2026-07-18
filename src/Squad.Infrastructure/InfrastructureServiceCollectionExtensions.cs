using Microsoft.Extensions.DependencyInjection;
using Squad.Core;

namespace Squad.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    /// <summary>
    /// Registers the whole ingest + persistence stack and the live-ride state.
    /// The SignalR fan-out (IActivityFanout) is registered by the Web host, since it
    /// depends on the hub. Adding a collection surface = one more ISourceAdapter line.
    /// </summary>
    public static IServiceCollection AddSquadInfrastructure(this IServiceCollection services, string sqlConnectionString)
    {
        // Collection-surface adapters (resolved by Source in the worker).
        services.AddSingleton<ISourceAdapter, FitUploadAdapter>();
        services.AddSingleton<ISourceAdapter, HealthKitAdapter>();
        services.AddSingleton<ISourceAdapter, HealthConnectAdapter>();
        // services.AddSingleton<ISourceAdapter, GarminWebhookAdapter>();  // dormant

        // Ingest pipeline.
        services.AddSingleton<IIngestQueue, ChannelIngestQueue>();
        services.AddHostedService<IngestWorker>();

        // Persistence (SQL Server).
        services.AddScoped<IActivityRepository>(_ => new SqlActivityRepository(sqlConnectionString));
        services.AddScoped<IRawActivityStore>(_ => new SqlRawActivityStore(sqlConnectionString));
        services.AddScoped<IAthleteDirectory>(_ => new SqlAthleteDirectory(sqlConnectionString));
        services.AddScoped<ILeaderboardService>(_ => new SqlLeaderboardService(sqlConnectionString));

        // Live-ride relay state (ephemeral).
        services.AddSingleton<IRideSessionState, InMemoryRideSessionState>();

        return services;
    }
}
