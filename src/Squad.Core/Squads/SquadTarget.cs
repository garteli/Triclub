using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Core;

/// <summary>A group/club target race a coach sets for the squad (same shape as an athlete's goal race).
/// Members can adopt it as their own goal. Date is ISO 'yyyy-MM-dd' (null when unknown).</summary>
public sealed record SquadTarget(
    Guid Id, Guid SquadId, string Name, string? RaceDate, string? Location, string? EventUrl, DateTimeOffset CreatedUtc);

/// <summary>Persists a squad's group targets. Add/remove are guarded to the squad's owner (coach).</summary>
public interface ISquadTargetStore
{
    Task<IReadOnlyList<SquadTarget>> ListAsync(Guid squadId, CancellationToken ct);
    Task<bool> IsOwnerAsync(Guid squadId, Guid ownerId, CancellationToken ct);
    /// <summary>Add a target if <paramref name="ownerId"/> owns the squad; null otherwise.</summary>
    Task<SquadTarget?> AddAsync(
        Guid squadId, Guid ownerId, string name, string? raceDate, string? location, string? eventUrl, CancellationToken ct);
    /// <summary>Remove a target if <paramref name="ownerId"/> owns the squad; false otherwise.</summary>
    Task<bool> RemoveAsync(Guid squadId, Guid ownerId, Guid targetId, CancellationToken ct);
}
