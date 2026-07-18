using Microsoft.Extensions.DependencyInjection;
using Squad.Ingest.Feed;

namespace Squad.Ingest;

public static class SquadFeedServiceCollectionExtensions
{
    /// <summary>
    /// Adds the live squad feed. Call after AddActivityIngest:
    ///     builder.Services.AddActivityIngest(conn);
    ///     builder.Services.AddSquadFeed();
    ///     builder.Services.AddScoped&lt;IAthleteDirectory, YourAthleteDirectory&gt;();
    /// then in the pipeline:
    ///     app.MapActivityIntake();
    ///     app.MapSquadHub();   // -> /hubs/squad
    /// </summary>
    public static IServiceCollection AddSquadFeed(this IServiceCollection services)
    {
        services.AddSignalR();
        services.AddScoped<IActivityFanout, SignalRActivityFanout>();
        // You provide: services.AddScoped<IAthleteDirectory, YourAthleteDirectory>();
        return services;
    }
}
