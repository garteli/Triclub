using System.Collections.Concurrent;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>Single-instance last-known-position store. Back with Redis + a SignalR backplane to scale out.</summary>
public sealed class InMemoryRideSessionState : IRideSessionState
{
    private readonly ConcurrentDictionary<Guid, ConcurrentDictionary<Guid, RiderUpdate>> _rides = new();

    private ConcurrentDictionary<Guid, RiderUpdate> Ride(Guid rideId)
        => _rides.GetOrAdd(rideId, _ => new ConcurrentDictionary<Guid, RiderUpdate>());

    public void Upsert(Guid rideId, RiderUpdate update) => Ride(rideId)[update.AthleteId] = update;

    public bool TryGet(Guid rideId, Guid athleteId, out RiderUpdate? update)
    {
        update = null;
        return _rides.TryGetValue(rideId, out var riders) && riders.TryGetValue(athleteId, out update);
    }

    public void Remove(Guid rideId, Guid athleteId)
    {
        if (_rides.TryGetValue(rideId, out var riders))
        {
            riders.TryRemove(athleteId, out _);
            if (riders.IsEmpty) _rides.TryRemove(rideId, out _);
        }
    }

    public IReadOnlyCollection<RiderUpdate> Snapshot(Guid rideId)
        => _rides.TryGetValue(rideId, out var riders) ? riders.Values.ToArray() : Array.Empty<RiderUpdate>();
}
