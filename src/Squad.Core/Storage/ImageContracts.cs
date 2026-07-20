// Image persistence ports + DTOs. Kept in the single Squad.Core namespace so
// hosts/infra need only `using Squad.Core;`. The domain owns the shapes; the
// Infrastructure persists blobs (Azure Blob Storage in prod, local disk in dev)
// and the ActivityPhoto rows; the Web host proxies reads through authenticated
// endpoints (blobs are private — never served by a public URL).
namespace Squad.Core;

/// <summary>A readable image blob: its content stream plus the content-type to echo back.</summary>
public sealed record ImageBlob(Stream Content, string ContentType, long Length);

/// <summary>
/// Stores/serves image blobs. Blob names are opaque keys the caller persists
/// (e.g. in dbo.Athlete.AvatarBlob or dbo.ActivityPhoto.BlobName) and later hands
/// back to <see cref="OpenReadAsync"/>. The container is private; reads go through
/// the app, never a public blob URL.
/// </summary>
public interface IImageStore
{
    /// <summary>Store <paramref name="content"/> under a fresh blob name beginning with
    /// <paramref name="prefix"/> (e.g. "avatars"); returns that blob name.</summary>
    Task<string> SaveAsync(string prefix, Stream content, string contentType, CancellationToken ct);

    /// <summary>Open the named blob for reading, or null if it doesn't exist.</summary>
    Task<ImageBlob?> OpenReadAsync(string blobName, CancellationToken ct);

    /// <summary>Delete the named blob (no-op if already gone).</summary>
    Task DeleteAsync(string blobName, CancellationToken ct);
}

/// <summary>A photo attached to (or captured during) an activity.</summary>
public sealed record ActivityPhotoRow(Guid Id, Guid AthleteId, Guid? ActivityId, DateTimeOffset CapturedUtc);

/// <summary>The owner + time window of an activity, used to resolve in-ride photos
/// (uploaded with a null ActivityId) to the activity whose window they fall in.</summary>
public sealed record ActivityWindow(Guid AthleteId, DateTimeOffset StartUtc, DateTimeOffset EndUtc);

/// <summary>Persists activity-photo rows (the blobs themselves live in <see cref="IImageStore"/>).</summary>
public interface IActivityPhotoService
{
    /// <summary>Record a photo. <paramref name="activityId"/> is null for an in-ride capture
    /// (resolved to an activity later by owner + time window).</summary>
    Task<Guid> AddAsync(Guid athleteId, Guid? activityId, string blobName, DateTimeOffset capturedUtc, CancellationToken ct);

    /// <summary>Photos for an activity: those explicitly attached to it, plus unattached
    /// in-ride captures by the same owner whose CapturedUtc falls in the activity window.</summary>
    Task<IReadOnlyList<ActivityPhotoRow>> ListForActivityAsync(Guid activityId, CancellationToken ct);

    /// <summary>The blob name for one photo (for the read proxy), or null if unknown.</summary>
    Task<string?> GetBlobNameAsync(Guid photoId, CancellationToken ct);

    /// <summary>The owner + [start,end] window of an activity, or null if it doesn't exist.</summary>
    Task<ActivityWindow?> GetActivityWindowAsync(Guid activityId, CancellationToken ct);
}
