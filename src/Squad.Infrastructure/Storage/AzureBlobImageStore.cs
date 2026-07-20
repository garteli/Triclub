// ===========================================================================
//  AzureBlobImageStore.cs  —  IImageStore over Azure Blob Storage.
//  One private container ("images") holds every image; blob names are prefixed
//  virtual folders (avatars/…, activity/…). The container is created private on
//  first use (public blob access is disabled on the account), so reads only ever
//  happen through the app's authenticated proxy endpoints — never a public URL.
// ===========================================================================
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class AzureBlobImageStore : IImageStore
{
    private readonly BlobContainerClient _container;
    private int _ensured; // 0 = not yet created; set once via EnsureContainerAsync

    public AzureBlobImageStore(string connectionString, string containerName = "images")
    {
        _container = new BlobServiceClient(connectionString).GetBlobContainerClient(containerName);
    }

    public async Task<string> SaveAsync(string prefix, Stream content, string contentType, CancellationToken ct)
    {
        await EnsureContainerAsync(ct);
        var blobName = $"{prefix.Trim('/')}/{Guid.NewGuid():N}{ExtFor(contentType)}";
        var blob = _container.GetBlobClient(blobName);
        await blob.UploadAsync(content, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
        }, ct);
        return blobName;
    }

    public async Task<ImageBlob?> OpenReadAsync(string blobName, CancellationToken ct)
    {
        var blob = _container.GetBlobClient(blobName);
        try
        {
            var res = await blob.DownloadStreamingAsync(cancellationToken: ct);
            var details = res.Value.Details;
            return new ImageBlob(res.Value.Content, details.ContentType ?? "application/octet-stream", details.ContentLength);
        }
        catch (RequestFailedException ex) when (ex.Status == 404)
        {
            return null;
        }
    }

    public async Task DeleteAsync(string blobName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(blobName)) return;
        await _container.GetBlobClient(blobName).DeleteIfExistsAsync(cancellationToken: ct);
    }

    private async Task EnsureContainerAsync(CancellationToken ct)
    {
        if (Volatile.Read(ref _ensured) == 1) return;
        // Private container (no public access). Idempotent.
        await _container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: ct);
        Volatile.Write(ref _ensured, 1);
    }

    private static string ExtFor(string contentType) => contentType switch
    {
        "image/jpeg" => ".jpg",
        "image/png" => ".png",
        "image/webp" => ".webp",
        "image/gif" => ".gif",
        _ => ".bin",
    };
}
