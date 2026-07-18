// ===========================================================================
//  RideHub.cs
//  Group-per-ride relay. A rider's recorder calls PushTelemetry; everyone in the
//  ride group gets 'riderMoved'. Identity is resolved from the connection (never
//  trusted from the payload) and cached in session state so we don't hit the
//  athlete DB on every telemetry tick.
// ===========================================================================
using System;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;
using Squad.Ingest.Feed;

namespace Squad.Ingest.LiveRide;

[Authorize]
public sealed class RideHub(IAthleteDirectory directory, IRideSessionState state) : Hub
{
    private static string RideGroup(Guid rideId) => $"ride:{rideId}";

    public async Task JoinRide(Guid rideId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, RideGroup(rideId));
        // Hand the newcomer the current positions so the map isn't empty until the next tick.
        await Clients.Caller.SendAsync("snapshot", state.Snapshot(rideId));
    }

    public async Task LeaveRide(Guid rideId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, RideGroup(rideId));
        var athleteId = ResolveAthleteId(Context.User);
        if (athleteId is not null)
        {
            state.Remove(rideId, athleteId.Value);
            await Clients.Group(RideGroup(rideId)).SendAsync("riderLeft", athleteId.Value);
        }
    }

    public async Task PushTelemetry(Guid rideId, RiderTelemetry t)
    {
        var athleteId = ResolveAthleteId(Context.User);
        if (athleteId is null) return;

        // Reuse cached identity; only hit the directory the first time we see this rider.
        string name, initials, color;
        if (state.TryGet(rideId, athleteId.Value, out var existing) && existing is not null)
        {
            name = existing.Name; initials = existing.Initials; color = existing.Color;
        }
        else
        {
            var p = await directory.GetAsync(athleteId.Value, Context.ConnectionAborted);
            name = p?.Name ?? ""; initials = p?.Initials ?? ""; color = p?.AvatarColor ?? "#d6ff3f";
        }

        var update = new RiderUpdate
        {
            AthleteId = athleteId.Value,
            Name = name, Initials = initials, Color = color,
            Lat = t.Lat, Lon = t.Lon,
            SpeedKph = t.SpeedKph, HeartRate = t.HeartRate, PowerW = t.PowerW, DistanceKm = t.DistanceKm,
            RadarThreatLevel = t.RadarThreatLevel,
            RadarVehicleCount = t.RadarVehicleCount,
            RadarClosestMeters = t.RadarClosestMeters,
            Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };

        state.Upsert(rideId, update);
        await Clients.Group(RideGroup(rideId)).SendAsync("riderMoved", update);
    }

    private static Guid? ResolveAthleteId(ClaimsPrincipal? user)
    {
        var claim = user?.FindFirstValue(ClaimTypes.NameIdentifier) ?? user?.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}

public static class RideHubEndpoints
{
    public static IEndpointRouteBuilder MapRideHub(this IEndpointRouteBuilder app)
    {
        app.MapHub<RideHub>("/hubs/ride");
        return app;
    }
}
