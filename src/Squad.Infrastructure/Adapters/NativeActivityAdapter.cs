// ===========================================================================
//  NativeActivityAdapter.cs
//  Proof of the architecture's core claim: adding a collection surface is one
//  new class. Both native platforms send the same canonical-mirror JSON, so they
//  share all the logic and differ ONLY in which Source they stamp.
// ===========================================================================
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

using Squad.Core;

namespace Squad.Infrastructure;

public abstract class NativeActivityAdapter : ISourceAdapter
{
    public abstract ActivitySource Source { get; }

    public Task<Activity> NormalizeAsync(RawActivity raw, CancellationToken ct)
    {
        var dto = JsonSerializer.Deserialize<NativeActivityDto>(raw.Payload, NativeJson.Options)
            ?? throw new System.InvalidOperationException("Empty or invalid native activity payload.");
        return Task.FromResult(NativeActivityMapper.ToActivity(dto, raw.AthleteId, Source));
    }
}

public sealed class HealthKitAdapter : NativeActivityAdapter
{
    public override ActivitySource Source => ActivitySource.HealthKit;
}

public sealed class HealthConnectAdapter : NativeActivityAdapter
{
    public override ActivitySource Source => ActivitySource.HealthConnect;
}
