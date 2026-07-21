using System;
using System.IO;
using System.Net.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
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
    /// <param name="aiApiKey">Anthropic API key for PDF plan import. Null/empty ⇒ the import feature
    /// reports "not configured" instead of running.</param>
    /// <param name="aiModel">Anthropic model id for plan import (default claude-sonnet-5).</param>
    public static IServiceCollection AddSquadInfrastructure(
        this IServiceCollection services, string sqlConnectionString, string? storageConnectionString = null,
        int paymentsClubFeeBps = 1000, string? aiApiKey = null, string? aiModel = null)
    {
        // Collection-surface adapters (resolved by Source in the worker).
        services.AddSingleton<ISourceAdapter, FitUploadAdapter>();
        services.AddSingleton<ISourceAdapter, HealthKitAdapter>();
        services.AddSingleton<ISourceAdapter, HealthConnectAdapter>();
        // services.AddSingleton<ISourceAdapter, GarminWebhookAdapter>();  // dormant

        // Ingest pipeline.
        services.AddSingleton<IIngestQueue, ChannelIngestQueue>();
        services.AddHostedService<IngestWorker>();

        // Weather enrichment (Open-Meteo, no API key). Typed HttpClient with a short timeout
        // so a slow/unreachable weather API can't stall the ingest worker — it's best-effort.
        services.AddHttpClient<IWeatherService, OpenMeteoWeatherService>(c =>
            c.Timeout = TimeSpan.FromSeconds(6));

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
        services.AddScoped<IKudosService>(_ => new SqlKudosService(sqlConnectionString));
        services.AddScoped<ICommentService>(_ => new SqlCommentService(sqlConnectionString));
        services.AddScoped<IFollowService>(_ => new SqlFollowService(sqlConnectionString));
        services.AddScoped<INotificationService>(_ => new SqlNotificationService(sqlConnectionString));
        services.AddScoped<IPlanService>(_ => new SqlPlanService(sqlConnectionString));
        services.AddScoped<IActivityPhotoService>(_ => new SqlActivityPhotoService(sqlConnectionString));
        services.AddScoped<IHealthDailyStore>(_ => new SqlHealthDailyStore(sqlConnectionString));

        // AI plan import (PDF → CoachPlan doc via Anthropic). The named client gets a long timeout —
        // a multi-page-PDF extraction is a slow single call. Unconfigured (no key) ⇒ the service reports
        // Configured=false and the endpoint returns an honest "not configured", never a fake plan.
        services.AddHttpClient("anthropic", c => c.Timeout = TimeSpan.FromSeconds(120));
        services.AddScoped<IPlanImportService>(sp => new AnthropicPlanImportService(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("anthropic"),
            aiApiKey, aiModel,
            sp.GetRequiredService<ILogger<AnthropicPlanImportService>>()));

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
