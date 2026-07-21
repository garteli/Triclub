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
    /// <param name="seedPlanLibrary">When true, a startup worker AI-generates any missing library plan
    /// templates (gated so generation only runs when explicitly enabled).</param>
    /// <param name="seedPlanLibraryLimit">Max templates to generate per run (0 = all). Lets the library be
    /// rolled out a few plans at a time.</param>
    public static IServiceCollection AddSquadInfrastructure(
        this IServiceCollection services, string sqlConnectionString, string? storageConnectionString = null,
        int paymentsClubFeeBps = 1000, string? aiApiKey = null, string? aiModel = null,
        bool seedPlanLibrary = false, int seedPlanLibraryLimit = 0)
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
        services.AddScoped<IClubRankingService>(_ => new SqlClubRankingService(sqlConnectionString));
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

        // AI plan import (PDF → CoachPlan doc via Anthropic). Runs in a background worker (not an
        // HTTP request), so the AI call isn't bound by Azure's ~230s front-end cap — a long multi-week
        // extraction gets a generous 300s. Unconfigured (no key) ⇒ Configured=false and the endpoint
        // reports an honest "not set up", never a fake plan.
        var aiConfigured = !string.IsNullOrWhiteSpace(aiApiKey);
        services.AddHttpClient("anthropic", c => c.Timeout = TimeSpan.FromSeconds(300));
        services.AddScoped<IPlanImportService>(sp => new AnthropicPlanImportService(
            sp.GetRequiredService<IHttpClientFactory>().CreateClient("anthropic"),
            aiApiKey, aiModel,
            sp.GetRequiredService<ILogger<AnthropicPlanImportService>>()));

        // Async import: an in-memory job queue the endpoint submits to, drained by a hosted worker.
        services.AddSingleton<PlanImportQueue>(_ => new PlanImportQueue(aiConfigured));
        services.AddSingleton<IPlanImportQueue>(sp => sp.GetRequiredService<PlanImportQueue>());
        services.AddHostedService<PlanImportWorker>();

        // Plan library: pre-generated, adoptable templates + a startup seeder (AI-generates missing ones,
        // gated by config so it only runs when explicitly turned on).
        services.AddScoped<IPlanTemplateStore>(_ => new SqlPlanTemplateStore(sqlConnectionString));
        services.AddHostedService(sp => new PlanLibrarySeeder(
            sp.GetRequiredService<IServiceScopeFactory>(),
            sp.GetRequiredService<ILogger<PlanLibrarySeeder>>(),
            seedPlanLibrary, seedPlanLibraryLimit));

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
