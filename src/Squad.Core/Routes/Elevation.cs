using System.Threading;
using System.Threading.Tasks;

namespace Squad.Core;

/// <summary>Computes a route's terrain elevation profile server-side — the fallback for when the
/// client can't reach the (rate-limited) elevation API. Input is the route geometry JSON
/// ([[lat,lon],…]); output is the same profile JSON the client caches
/// (<c>{ profile:[{dist,e}], ascent, min, max }</c>), or null on failure.</summary>
public interface IElevationService
{
    Task<string?> ComputeAsync(string routePointsJson, CancellationToken ct);
}
