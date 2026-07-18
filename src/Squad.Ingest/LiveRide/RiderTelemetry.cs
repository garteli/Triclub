// ===========================================================================
//  RiderTelemetry.cs
//  Live-ride is EPHEMERAL relay, not ingest — none of this is persisted. A rider's
//  recorder pushes RiderTelemetry a few times a second; the hub enriches it with
//  identity and relays a RiderUpdate to everyone watching that ride. We keep the
//  last-known update per rider in memory so a late joiner gets an instant snapshot.
// ===========================================================================
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;

namespace Squad.Ingest.LiveRide;

/// <summary>What a rider's own device sends up.</summary>
public sealed record RiderTelemetry(
    double Lat, double Lon, double? ElevM,
    double? SpeedKph, double? HeartRate, double? Cadence, double? PowerW, double? DistanceKm,
    int? RadarThreatLevel = null, int? RadarVehicleCount = null,
    double? RadarClosestMeters = null, double? RadarClosestClosingKph = null);

/// <summary>What every watcher receives — telemetry enriched with who it is.</summary>
public sealed record RiderUpdate
{
    public Guid AthleteId { get; init; }
    public string Name { get; init; } = "";
    public string Initials { get; init; } = "";
    public string Color { get; init; } = "#d6ff3f";
    public double Lat { get; init; }
    public double Lon { get; init; }
    public double? SpeedKph { get; init; }
    public double? HeartRate { get; init; }
    public double? PowerW { get; init; }
    public double? DistanceKm { get; init; }
    // Rear radar summary (nullable — only present if the rider has a radar paired).
    public int? RadarThreatLevel { get; init; }   // 0 none · 1 approaching · 2 fast · 3 unknown
    public int? RadarVehicleCount { get; init; }
    public double? RadarClosestMeters { get; init; }
    public long Ts { get; init; } // unix ms — lets the client detect a stale/dropped rider
}

/// <summary>
/// Last-known position per rider per ride. In-memory + single-instance only; to scale
/// out, back this with Redis and add a SignalR Redis backplane so groups fan out across nodes.
/// </summary>
public interface IRideSessionState
{
    void Upsert(Guid rideId, RiderUpdate update);
    bool TryGet(Guid rideId, Guid athleteId, out RiderUpdate? update);
    void Remove(Guid rideId, Guid athleteId);
    IReadOnlyCollection<RiderUpdate> Snapshot(Guid rideId);
}

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
