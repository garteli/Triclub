using System.IO;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Squad.Core;

namespace Squad.Infrastructure;

public static class InfrastructureServiceCollectionExtensions
{
    /// <summary>
    /// Registers the whole ingest + persistence stack and the live-ride state.
    /// The SignalR fan-out (IActivityFanout) is registered by the Web host, since it
    /// depends on the hub. Adding a collection surface = one more ISourceAdapter line.
    /// </summary>
    /// <param name="storageConnectionString">Azure Storage connection string for image blobs.
    /// When null/empty, images fall back to the local filesystem (dev/no-storage-account).</param>
    /// <param name="paymentsClubFeeBps">The club's default cut of each tracked ride payment, in basis
    /// points (1000 = 10%). Snapshotted onto each ledger row at creation.</param>
    public static IServiceCollection AddSquadInfrastructure(
        this IServiceCollection services, string sqlConnectionString, string? storageConnectionString = null,
        int paymentsClubFeeBps = 1000)
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
        services.AddScoped<IFeedReadService>(_ => new SqlFeedService(sqlConnectionString));
        services.AddScoped<IActivityReadService>(_ => new SqlActivityReadService(sqlConnectionString));
        services.AddScoped<IAthleteAccounts>(_ => new SqlAthleteAccounts(sqlConnectionString));
        services.AddScoped<IProfileService>(_ => new SqlProfileService(sqlConnectionString));
        services.AddScoped<ISquadService>(_ => new SqlSquadService(sqlConnectionString));
        services.AddScoped<IPaymentService>(_ => new SqlPaymentService(sqlConnectionString, paymentsClubFeeBps));
        services.AddScoped<IChatService>(_ => new SqlChatService(sqlConnectionString));
        services.AddScoped<IFollowService>(_ => new SqlFollowService(sqlConnectionString));
        services.AddScoped<INotificationService>(_ => new SqlNotificationService(sqlConnectionString));
        services.AddScoped<IPlanService>(_ => new SqlPlanService(sqlConnectionString));
        services.AddScoped<IActivityPhotoService>(_ => new SqlActivityPhotoService(sqlConnectionString));
        services.AddScoped<IHealthDailyStore>(_ => new SqlHealthDailyStore(sqlConnectionString));

        // Image blobs: Azure Blob Storage in prod (connection string set), else the
        // local filesystem fallback under {ContentRoot}/App_Data/images for dev.
        if (!string.IsNullOrWhiteSpace(storageConnectionString))
            services.AddSingleton<IImageStore>(_ => new AzureBlobImageStore(storageConnectionString));
        else
            services.AddSingleton<IImageStore>(sp => new FileSystemImageStore(
                Path.Combine(sp.GetRequiredService<IHostEnvironment>().ContentRootPath, "App_Data", "images")));

        // Live-ride relay state (ephemeral).
        services.AddSingleton<IRideSessionState, InMemoryRideSessionState>();

        return services;
    }
}
