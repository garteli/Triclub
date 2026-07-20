// ===========================================================================
//  FileSystemImageStore.cs  —  IImageStore over the local filesystem.
//  The local-dev / no-storage-account fallback: when ConnectionStrings:Storage
//  isn't configured, images are written under {root}/App_Data/images so the app
//  still runs end-to-end. Blob names are the same prefixed keys the Azure store
//  uses (avatars/…, activity/…), mapped to files. NOT for production (single-box,
//  no redundancy) — Azure Blob is used wherever the connection string is set.
// ===========================================================================
using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

using Squad.Core;

namespace Squad.Infrastructure;

public sealed class FileSystemImageStore : IImageStore
{
    private readonly string _root;

    public FileSystemImageStore(string rootPath)
    {
        _root = rootPath;
        Directory.CreateDirectory(_root);
    }

    public async Task<string> SaveAsync(string prefix, Stream content, string contentType, CancellationToken ct)
    {
        var blobName = $"{prefix.Trim('/')}/{Guid.NewGuid():N}{ExtFor(contentType)}";
        var path = PathFor(blobName);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            await content.CopyToAsync(fs, ct);
        // Stash the content-type alongside the bytes so reads can echo it back.
        await File.WriteAllTextAsync(path + ".type", contentType, ct);
        return blobName;
    }

    public Task<ImageBlob?> OpenReadAsync(string blobName, CancellationToken ct)
    {
        var path = PathFor(blobName);
        if (!File.Exists(path)) return Task.FromResult<ImageBlob?>(null);
        var contentType = File.Exists(path + ".type") ? File.ReadAllText(path + ".type") : "application/octet-stream";
        var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        return Task.FromResult<ImageBlob?>(new ImageBlob(fs, contentType, fs.Length));
    }

    public Task DeleteAsync(string blobName, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(blobName))
        {
            var path = PathFor(blobName);
            if (File.Exists(path)) File.Delete(path);
            if (File.Exists(path + ".type")) File.Delete(path + ".type");
        }
        return Task.CompletedTask;
    }

    // Guard against path traversal: only the characters our own keys use are allowed.
    private string PathFor(string blobName)
    {
        var safe = blobName.Replace('\\', '/');
        if (safe.Contains("..") || Path.IsPathRooted(safe))
            throw new ArgumentException("Invalid blob name.", nameof(blobName));
        return Path.Combine(_root, safe.Replace('/', Path.DirectorySeparatorChar));
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
