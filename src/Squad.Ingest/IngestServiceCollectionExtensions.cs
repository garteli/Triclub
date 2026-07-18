using Microsoft.Extensions.DependencyInjection;

namespace Squad.Ingest;

public static class IngestServiceCollectionExtensions
{
    /// <summary>
    /// Registers the ingest pipeline. Call from Program.cs:
    ///     builder.Services.AddActivityIngest(connectionString);
    /// then app.MapActivityIntake();
    /// Adding a new source later = one more AddSingleton&lt;ISourceAdapter, XxxAdapter&gt;().
    /// </summary>
    public static IServiceCollection AddActivityIngest(this IServiceCollection services, string sqlConnectionString)
    {
        // Adapters — resolved by Source in the worker. New surface = new line here.
        services.AddSingleton<ISourceAdapter, FitUploadAdapter>();
        services.AddSingleton<ISourceAdapter, HealthKitAdapter>();       // step 5 (iOS companion)
        services.AddSingleton<ISourceAdapter, HealthConnectAdapter>();   // step 6 (Android companion)
        // services.AddSingleton<ISourceAdapter, GarminWebhookAdapter>();   // step 7 (dormant)

        services.AddSingleton<IIngestQueue, ChannelIngestQueue>();
        services.AddScoped<IActivityRepository>(_ => new SqlActivityRepository(sqlConnectionString));

        // Provide your own IRawActivityStore (EF/Dapper/blob). Registered by the host:
        //   services.AddScoped<IRawActivityStore, SqlRawActivityStore>();
        // Optional fan-out (SignalR): services.AddScoped<IActivityFanout, SignalRFanout>();

        services.AddHostedService<IngestWorker>();
        return services;
    }
}
