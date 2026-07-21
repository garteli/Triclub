using System;
using System.Collections.Generic;

namespace Squad.Core;

/// <summary>One plan to generate: a race distance at a goal-time level, over a set number of weeks.</summary>
public sealed record PlanSpec(string Distance, string Level, string GoalLabel, int Weeks, string Focus)
{
    /// <summary>Stable catalog key so the seeder is idempotent (won't regenerate an existing template).</summary>
    public string Key => $"{Distance}|{Level}".ToLowerInvariant();

    /// <summary>Human title, e.g. "Marathon · Sub-3:00 · 16 weeks".</summary>
    public string Title => $"{Distance} · {GoalLabel} · {Weeks} weeks";
}

/// <summary>A generated, reusable plan template users browse and adopt. <see cref="Doc"/> is the
/// CoachPlan editor JSON (same shape the editor loads); adopting copies it into the user's plans.</summary>
public sealed record PlanTemplate(
    Guid Id, string Distance, string Level, string GoalLabel, string Name, int Weeks, int SortOrder,
    string Doc, DateTimeOffset UpdatedUtc);

/// <summary>Summary row for the library catalog (no heavy Doc body).</summary>
public sealed record PlanTemplateSummary(
    Guid Id, string Distance, string Level, string GoalLabel, string Name, int Weeks, int SortOrder);

public interface IPlanTemplateStore
{
    Task<IReadOnlyList<PlanTemplateSummary>> ListAsync(CancellationToken ct);
    Task<PlanTemplate?> GetAsync(Guid id, CancellationToken ct);
    Task<bool> ExistsAsync(string distance, string level, CancellationToken ct);
    Task UpsertAsync(PlanTemplate template, CancellationToken ct);
}

/// <summary>
/// The fixed catalog of plans the library ships: 6 race distances × 5 goal-time levels = 30.
/// Order (distance, then hardest goal first) drives SortOrder. Weeks are kept modest per distance so
/// generation output stays within the model's token budget and browsing/adopting is quick.
/// </summary>
public static class PlanCatalog
{
    public static readonly IReadOnlyList<PlanSpec> All = Build();

    private static List<PlanSpec> Build()
    {
        var list = new List<PlanSpec>();

        void Add(string distance, int weeks, string focus, params (string level, string goal)[] levels)
        {
            foreach (var (level, goal) in levels)
                list.Add(new PlanSpec(distance, level, goal, weeks, focus));
        }

        Add("5K", 8, "5K speed & threshold",
            ("sub16", "Sub-16:00"), ("sub18", "Sub-18:00"), ("sub20", "Sub-20:00"), ("sub22", "Sub-22:00"), ("sub25", "Sub-25:00"));

        Add("10K", 10, "10K threshold & VO2",
            ("sub35", "Sub-35:00"), ("sub40", "Sub-40:00"), ("sub45", "Sub-45:00"), ("sub50", "Sub-50:00"), ("sub55", "Sub-55:00"));

        Add("Half Marathon", 12, "Half-marathon endurance & tempo",
            ("sub120", "Sub-1:20"), ("sub130", "Sub-1:30"), ("sub145", "Sub-1:45"), ("sub200", "Sub-2:00"), ("sub215", "Sub-2:15"));

        Add("Marathon", 16, "Marathon endurance & long runs",
            ("sub300", "Sub-3:00"), ("sub330", "Sub-3:30"), ("sub400", "Sub-4:00"), ("sub430", "Sub-4:30"), ("sub500", "Sub-5:00"));

        Add("70.3", 12, "Half-Ironman: swim/bike/run balance & bricks",
            ("sub430", "Sub-4:30"), ("sub500", "Sub-5:00"), ("sub530", "Sub-5:30"), ("sub600", "Sub-6:00"), ("finish", "Finish strong"));

        Add("140.6", 16, "Ironman: aerobic volume, long bricks & fuelling",
            ("sub900", "Sub-9:00"), ("sub1000", "Sub-10:00"), ("sub1100", "Sub-11:00"), ("sub1200", "Sub-12:00"), ("finish", "Finish strong"));

        return list;
    }
}
