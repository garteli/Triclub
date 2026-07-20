using System.Security.Claims;

using Squad.Core;

namespace Squad.Web;

/// <summary>
/// Group-ride payment tracking (ledger). The app doesn't process money — coaches
/// collect out-of-band (e-transfer / cash / their own link). These endpoints record
/// who owes/paid the coach for a ride and book the club's cut. The payee (coach) is
/// the squad owner; the ledger + summary are owner-only. Swap the create seam for
/// Stripe Connect later if you want the cut auto-collected.
/// </summary>
public static class PaymentEndpoints
{
    public static IEndpointRouteBuilder MapPayments(this IEndpointRouteBuilder app)
    {
        var g = app.MapGroup("/api/payments").RequireAuthorization();
        g.MapPost("", Create);                              // rider records a payment they owe/paid
        g.MapGet("/mine", Mine);                            // rider's own history
        g.MapGet("/squad/{squadId:guid}", SquadLedger);     // coach ledger (owner-only)
        g.MapGet("/squad/{squadId:guid}/summary", Summary); // coach totals (owner-only)
        g.MapPost("/{id:guid}/paid", MarkPaid);             // payer or coach confirms settled
        g.MapPost("/{id:guid}/waive", Waive);               // coach waives the charge
        return app;
    }

    private static async Task<IResult> Create(
        RidePaymentCreate body, HttpContext http, IPaymentService payments,
        INotificationService notes, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (body.AmountMinor <= 0) return Results.BadRequest(new { error = "Amount must be positive." });

        var created = await payments.CreateAsync(body, me, ct);
        if (created is null) return Results.NotFound(new { error = "Squad not found, or it has no coach to pay." });

        // Let the coach know a rider logged a payment for their group (skip when the coach paid their own).
        if (created.CoachId != me)
            await notes.AddAsync(created.CoachId, "payment", me, created.PayerName,
                $"recorded a payment for {created.SquadName}", ct);

        return Results.Created($"/api/payments/{created.Id}", created);
    }

    private static async Task<IResult> Mine(HttpContext http, IPaymentService payments, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        return Results.Ok(await payments.ListForPayerAsync(me, ct));
    }

    private static async Task<IResult> SquadLedger(Guid squadId, HttpContext http, IPaymentService payments, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var rows = await payments.ListForSquadAsync(squadId, me, ct);
        return rows is null ? Results.NotFound(new { error = "You don't own this squad." }) : Results.Ok(rows);
    }

    private static async Task<IResult> Summary(Guid squadId, HttpContext http, IPaymentService payments, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var summary = await payments.SummaryForSquadAsync(squadId, me, ct);
        return summary is null ? Results.NotFound(new { error = "You don't own this squad." }) : Results.Ok(summary);
    }

    private static async Task<IResult> MarkPaid(
        Guid id, RidePaymentSettle body, HttpContext http, IPaymentService payments, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        if (string.IsNullOrWhiteSpace(body.Method)) return Results.BadRequest(new { error = "A payment method is required." });

        var updated = await payments.MarkPaidAsync(id, me, body.Method, body.Note, ct);
        return updated is null
            ? Results.NotFound(new { error = "Payment not found, already waived, or not yours to settle." })
            : Results.Ok(updated);
    }

    private static async Task<IResult> Waive(
        Guid id, RidePaymentNote? body, HttpContext http, IPaymentService payments, CancellationToken ct)
    {
        if (Me(http) is not { } me) return Results.Unauthorized();
        var updated = await payments.WaiveAsync(id, me, body?.Note, ct);
        return updated is null
            ? Results.NotFound(new { error = "Payment not found, or you're not the coach." })
            : Results.Ok(updated);
    }

    private static Guid? Me(HttpContext http)
    {
        var claim = http.User.FindFirstValue(ClaimTypes.NameIdentifier) ?? http.User.FindFirstValue("sub");
        return Guid.TryParse(claim, out var id) ? id : null;
    }
}
