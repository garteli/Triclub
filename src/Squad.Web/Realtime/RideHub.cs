// ===========================================================================
//  RideHub.cs
//  Group-per-ride relay. A rider's recorder calls PushTelemetry; everyone in the
//  ride group gets 'riderMoved'. Identity is resolved from the connection (never
//  trusted from the payload) and cached in session state so we don't hit the
//  athlete DB on every telemetry tick.
// ===========================================================================
using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.SignalR;

using Squad.Core;

namespace Squad.Web;

[Authorize]
public sealed class RideHub(IAthleteDirectory directory, IRideSessionState state, ISquadService squads, INotificationService notes) : Hub
{
    private static string RideGroup(Guid rideId) => $"ride:{rideId}";

    public async Task JoinRide(Guid rideId)
    {
        // A ride channel is a squad's channel (rideId == squadId). Only members may see/appear in it,
        // so someone the owner just removed can't linger in — or rejoin — the group's lobby.
        var athleteId = ResolveAthleteId(Context.User);
        if (athleteId is null || !await squads.IsMemberAsync(rideId, athleteId.Value, Context.ConnectionAborted))
            return;

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

        // Reuse cached identity; only hit the directory the first time we see this rider. The first
        // time (or the first push after they were evicted) also re-checks membership, so a removed
        // rider's stale client can't re-add itself to the squad's presence.
        string name, initials, color;
        state.TryGet(rideId, athleteId.Value, out var existing);
        if (existing is not null)
        {
            name = existing.Name; initials = existing.Initials; color = existing.Color;
        }
        else
        {
            if (!await squads.IsMemberAsync(rideId, athleteId.Value, Context.ConnectionAborted)) return;
            var p = await directory.GetAsync(athleteId.Value, Context.ConnectionAborted);
            name = p?.Name ?? ""; initials = p?.Initials ?? ""; color = p?.AvatarColor ?? "#d6ff3f";
        }

        // A presence heartbeat (no GPS yet) carries null Lat/Lon — keep the last known position so
        // it isn't erased, and just refresh the rider's timestamp/metrics.
        var lat = t.Lat ?? existing?.Lat;
        var lon = t.Lon ?? existing?.Lon;

        var update = new RiderUpdate
        {
            AthleteId = athleteId.Value,
            Name = name, Initials = initials, Color = color,
            Lat = lat, Lon = lon,
            SpeedKph = t.SpeedKph, HeartRate = t.HeartRate, PowerW = t.PowerW, DistanceKm = t.DistanceKm,
            RadarThreatLevel = t.RadarThreatLevel,
            RadarVehicleCount = t.RadarVehicleCount,
            RadarClosestMeters = t.RadarClosestMeters,
            Driver = t.Driver,
            Ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        };

        // Pack-position fusion (needs a real GPS anchor): sharpen this rider's spot from fresh BLE
        // ranges to teammates. Skipped for presence-only riders that don't have a position yet.
        if (lat is { } glat && lon is { } glon)
        {
            var fused = FuseRider(rideId, athleteId.Value, glat, glon);
            if (fused.Fused)
                update = update with { FusedLat = fused.Lat, FusedLon = fused.Lon, NearestGapM = fused.NearestGapM, Fused = true };
        }

        state.Upsert(rideId, update);
        await Clients.Group(RideGroup(rideId)).SendAsync("riderMoved", update);
    }

    // Only ranges newer than this feed the fix — a stale range would anchor to where a
    // teammate used to be.
    private const long PeerRangeTtlMs = 6_000;

    /// <summary>
    /// Localize <paramref name="athleteId"/> from its GPS fix plus the freshest BLE range to
    /// each teammate (either direction of the pair), anchoring on those teammates' current
    /// positions. Returns the unrefined GPS position when no usable range exists.
    /// </summary>
    private FusedPosition FuseRider(Guid rideId, Guid athleteId, double lat, double lon)
    {
        long now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Newest fresh range to each distinct teammate.
        var perPeer = new Dictionary<Guid, PeerRangeObservation>();
        foreach (var r in state.PeerRanges(rideId))
        {
            if (now - r.Ts > PeerRangeTtlMs || r.DistanceM is null) continue;
            Guid other;
            if (r.ObserverId == athleteId) other = r.PeerId;
            else if (r.PeerId == athleteId) other = r.ObserverId;
            else continue;
            if (!perPeer.TryGetValue(other, out var cur) || r.Ts > cur.Ts) perPeer[other] = r;
        }
        if (perPeer.Count == 0) return new FusedPosition(lat, lon, null, false);

        // Anchor on each teammate's current position (their own fused fix when they have one).
        var neighbors = new List<(double Lat, double Lon, double RangeM)>(perPeer.Count);
        foreach (var (other, obs) in perPeer)
        {
            if (!state.TryGet(rideId, other, out var u) || u is null) continue;
            // A presence-only teammate (no GPS yet) can't anchor the fusion — skip them.
            if ((u.FusedLat ?? u.Lat) is { } alat && (u.FusedLon ?? u.Lon) is { } alon)
                neighbors.Add((alat, alon, obs.DistanceM!.Value));
        }
        if (neighbors.Count == 0) return new FusedPosition(lat, lon, null, false);

        return PackFusion.Localize(lat, lon, neighbors);
    }

    /// <summary>
    /// Phone-to-phone BLE range: the caller's device saw a teammate's beacon. Identity of
    /// the observer is taken from the connection, never the payload. Recorded for the
    /// pack-position fusion pass; not fanned out (the fused position rides on 'riderMoved').
    /// </summary>
    public Task PushPeerRange(Guid rideId, PeerRange r)
    {
        var observerId = ResolveAthleteId(Context.User);
        if (observerId is null || r is null) return Task.CompletedTask;
        // Ignore a device ranging itself (its own beacon echoed back).
        if (r.PeerId == observerId.Value) return Task.CompletedTask;

        state.RecordPeerRange(rideId, new PeerRangeObservation(
            observerId.Value, r.PeerId, r.Rssi, r.DistanceM,
            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()));

        // TODO(pack-fusion): a positioning pass consumes state.PeerRanges(rideId) together
        // with each rider's GPS+heading to tighten in-pack spacing. Until it lands the
        // ranges are recorded but positions still come straight from GPS.
        return Task.CompletedTask;
    }

    /// <summary>Relay a UWB (Nearby Interaction) discovery token from the caller to a specific
    /// teammate so the two devices can open a precise-ranging session. The token is opaque; the
    /// sender's identity is taken from the connection, never the payload. Fanned out to the whole
    /// ride group with an explicit <c>to</c> so the intended recipient's client can filter for it.</summary>
    public async Task ShareUwbToken(Guid rideId, Guid toAthleteId, string token)
    {
        var fromAthleteId = ResolveAthleteId(Context.User);
        if (fromAthleteId is null || string.IsNullOrEmpty(token)) return;
        await Clients.Group(RideGroup(rideId)).SendAsync("uwbToken", new
        {
            from = fromAthleteId.Value,
            to = toAthleteId,
            token,
        });
    }

    /// <summary>
    /// A rider's device detected a fall (impact + stillness) that they did not cancel. Broadcasts a
    /// <c>crashAlert</c> to everyone in the ride group in realtime (with the rider's last position so
    /// teammates can reach them), and fans an in-app notification out to the whole squad so members who
    /// aren't currently riding still see it. Identity is taken from the connection, never the payload.
    /// Best-effort: a failed notification write for one member never blocks the others or the broadcast.
    /// </summary>
    public async Task RaiseCrashAlert(Guid rideId, double? lat, double? lon)
    {
        var athleteId = ResolveAthleteId(Context.User);
        if (athleteId is null || !await squads.IsMemberAsync(rideId, athleteId.Value, Context.ConnectionAborted))
            return;

        var p = await directory.GetAsync(athleteId.Value, Context.ConnectionAborted);
        var name = string.IsNullOrWhiteSpace(p?.Name) ? "A rider" : p!.Name;

        // Realtime banner to everyone currently in the ride group.
        await Clients.Group(RideGroup(rideId)).SendAsync("crashAlert", new
        {
            athleteId = athleteId.Value,
            name,
            lat,
            lon,
            ts = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        });

        // In-app fan-out to the whole squad (members not currently riding still get notified).
        var text = lat is { } la && lon is { } lo
            ? $"{name} may have crashed during a group ride. Last position {la.ToString("0.00000", System.Globalization.CultureInfo.InvariantCulture)}, {lo.ToString("0.00000", System.Globalization.CultureInfo.InvariantCulture)}."
            : $"{name} may have crashed during a group ride.";

        IReadOnlyList<Guid> members;
        try { members = await squads.GetMemberIdsAsync(rideId, Context.ConnectionAborted); }
        catch { members = System.Array.Empty<Guid>(); }

        foreach (var memberId in members)
        {
            if (memberId == athleteId.Value) continue;
            try { await notes.AddAsync(memberId, "crash", athleteId.Value, name, text, rideId, Context.ConnectionAborted); }
            catch { /* best-effort per recipient — never fail the whole alert */ }
        }
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
