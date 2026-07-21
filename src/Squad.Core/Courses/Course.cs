using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Squad.Core;

/// <summary>A saved route/course: an ordered polyline of GPS points a rider can follow on the live
/// map, and a coach can attach to a planned ride. <see cref="Points"/> is a JSON array of [lat,lon].</summary>
public sealed record Course(
    Guid Id, Guid OwnerId, string Name, string Points, double? DistanceKm, int PointCount, DateTimeOffset CreatedUtc);

/// <summary>List row for a course (no heavy points body).</summary>
public sealed record CourseSummary(Guid Id, string Name, double? DistanceKm, int PointCount, DateTimeOffset CreatedUtc);

/// <summary>Persists a rider/coach's saved courses. Owner-scoped: a course belongs to whoever saved it.</summary>
public interface ICourseStore
{
    Task<IReadOnlyList<CourseSummary>> ListAsync(Guid ownerId, CancellationToken ct);
    Task<Course?> GetAsync(Guid ownerId, Guid id, CancellationToken ct);
    Task<Guid> CreateAsync(Guid ownerId, string name, string pointsJson, double? distanceKm, int pointCount, CancellationToken ct);
    Task<bool> DeleteAsync(Guid ownerId, Guid id, CancellationToken ct);
}
