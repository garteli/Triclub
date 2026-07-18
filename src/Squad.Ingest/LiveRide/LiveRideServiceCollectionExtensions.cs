using Microsoft.Extensions.DependencyInjection;
using Squad.Ingest.LiveRide;

namespace Squad.Ingest;

public static class LiveRideServiceCollectionExtensions
{
    /// <summary>
    /// Adds the live-ride relay. Requires IAthleteDirectory (from AddSqlIngestStores).
    ///     builder.Services.AddLiveRide();
    ///     ...
    ///     app.MapRideHub();   // -> /hubs/ride
    /// </summary>
    public static IServiceCollection AddLiveRide(this IServiceCollection services)
    {
        services.AddSignalR();                                       // idempotent if already added
        services.AddSingleton<IRideSessionState, InMemoryRideSessionState>();
        return services;
    }
}
