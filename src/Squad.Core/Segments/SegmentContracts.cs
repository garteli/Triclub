namespace Squad.Core;

/// <summary>A request to rank a stretch of road (an ad-hoc "segment"). The client sends the
/// section's polyline (from an activity's route breakdown) + its length; the server finds every
/// rider whose recorded track covered that same stretch and times their effort over it.
/// Scope: "squad" (the viewer's club), "all" (everyone), "year" (everyone, this calendar year).
/// Path is [[lat,lon], …] in ride order; Sport is the ActivitySource sport byte (bike/run/…).</summary>
public sealed record SegmentBoardRequest(string Scope, int Sport, double LengthM, IReadOnlyList<double[]> Path);

/// <summary>One rider's best effort over the segment.</summary>
public sealed record SegmentEffort(
    Guid AthleteId, string Name, string Initials, string AvatarColor, string? AvatarUrl,
    int TimeSec, double AvgSpeedKph, DateTimeOffset WhenUtc, bool IsMe);

/// <summary>The ranked board — one entry per rider (their fastest matching effort), fastest first.
/// YourEffortCount is how many of the viewer's own activities matched this stretch (not deduped),
/// so the segment page can show "N efforts". Bounded by the candidate scan cap.</summary>
public sealed record SegmentBoard(IReadOnlyList<SegmentEffort> Efforts, int YourEffortCount);

/// <summary>Ranks efforts over an ad-hoc segment by scanning stored GPS tracks. No stored segment
/// table — each request matches the supplied polyline against candidate activities on the fly.</summary>
public interface ISegmentBoardService
{
    Task<SegmentBoard> GetAsync(Guid squadId, Guid viewerId, SegmentBoardRequest req, CancellationToken ct);
}
