using Microsoft.Extensions.DependencyInjection;
using Squad.Ingest.Data;
using Squad.Ingest.Feed;
using Squad.Ingest.Leaderboard;

namespace Squad.Ingest;

public static class SqlStoresServiceCollectionExtensions
{
    /// <summary>
    /// Registers the SQL Server implementations of the two host-provided interfaces,
    /// plus the leaderboard aggregation service.
    ///     builder.Services.AddActivityIngest(cs);
    ///     builder.Services.AddSquadFeed();
    ///     builder.Services.AddSqlIngestStores(cs);
    /// </summary>
    public static IServiceCollection AddSqlIngestStores(this IServiceCollection services, string connectionString)
    {
        services.AddScoped<IRawActivityStore>(_ => new SqlRawActivityStore(connectionString));
        services.AddScoped<IAthleteDirectory>(_ => new SqlAthleteDirectory(connectionString));
        services.AddScoped<ILeaderboardService>(_ => new SqlLeaderboardService(connectionString));
        return services;
    }
}
