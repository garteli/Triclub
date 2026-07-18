using System.Threading.Channels;
using Squad.Core;

namespace Squad.Infrastructure;

/// <summary>
/// Bounded hand-off between the request thread and the ingest worker. Swap for a real
/// queue (Azure Storage Queue / RabbitMQ) when scaling past one instance.
/// </summary>
public sealed class ChannelIngestQueue : IIngestQueue
{
    private readonly Channel<Guid> _channel =
        Channel.CreateBounded<Guid>(new BoundedChannelOptions(1024)
        {
            FullMode = BoundedChannelFullMode.Wait,
            SingleReader = true,
        });

    public ValueTask EnqueueAsync(Guid rawActivityId, CancellationToken ct = default)
        => _channel.Writer.WriteAsync(rawActivityId, ct);

    public IAsyncEnumerable<Guid> DequeueAllAsync(CancellationToken ct)
        => _channel.Reader.ReadAllAsync(ct);
}
