using System;
using System.Threading;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace Squad.Ingest;

/// <summary>
/// Hand-off between the request thread and the background worker. Bounded so a flood
/// of uploads applies backpressure instead of blowing up memory. Swap for Azure
/// Storage Queue / RabbitMQ when you scale past one instance — nothing else changes.
/// </summary>
public interface IIngestQueue
{
    ValueTask EnqueueAsync(Guid rawActivityId, CancellationToken ct = default);
    IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct);
}

public sealed class ChannelIngestQueue : IIngestQueue
{
    private readonly Channel<Guid> _channel =
        Channel.CreateBounded<Guid>(new BoundedChannelOptions(capacity: 1024)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
        });

    public ValueTask EnqueueAsync(Guid rawActivityId, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(rawActivityId, ct);

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}
