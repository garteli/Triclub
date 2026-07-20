// Ride-payment tracking. The app does NOT process money — coaches collect via their
// own channel (e-transfer / cash / a personal payment link). This slice is a *ledger*:
// it records who owes/paid the coach for a group ride and books the club's cut so the
// club can reconcile (invoice the coach, or net it off) later. Money never flows through
// the platform, so there is no fund-holding / money-transmitter exposure here.
//
// Amounts are integer minor units (agorot / cents) to avoid float drift — format on the
// client. The "coach" (payee) is the squad's OwnerId, resolved server-side at creation.
// If you later want the cut auto-collected, this is the seam to swap for Stripe Connect
// destination charges with an application_fee — the ledger shape stays the same.
namespace Squad.Core;

/// <summary>One ride-payment ledger row: rider (payer) → coach (payee), with the club's cut booked.</summary>
public sealed record RidePayment(
    Guid Id,
    Guid SquadId,
    string SquadName,
    Guid PayerId,
    string PayerName,
    string PayerInitials,
    string PayerAvatarColor,
    Guid CoachId,
    // What it's for: member (monthly) | dropin (one group ride) | coach (1:1). Free-form string
    // to match Squad.Kind; normalized on write.
    string Kind,
    long AmountMinor,        // gross the rider owes/paid, minor units
    string Currency,         // ISO-4217, e.g. ILS
    int ClubFeeBps,          // club's cut in basis points (1000 = 10%), snapshotted at creation
    long ClubCutMinor,       // = AmountMinor * ClubFeeBps / 10000
    long CoachNetMinor,      // = AmountMinor - ClubCutMinor
    string Status,           // owed | paid | waived
    string? Method,          // how it settled: etransfer | cash | link | other
    string? Note,
    DateTimeOffset CreatedUtc,
    DateTimeOffset? PaidUtc);

/// <summary>A rider records what they owe/paid for a ride. Payer = caller; coach + fee resolved server-side.</summary>
public sealed record RidePaymentCreate(
    Guid SquadId,
    string Kind,
    long AmountMinor,
    string? Currency = null,
    // Optional per-payment override of the club's cut; when null the club default applies.
    int? ClubFeeBps = null,
    string? Note = null);

/// <summary>Marking a payment settled — who collected it and how.</summary>
public sealed record RidePaymentSettle(string Method, string? Note = null);

/// <summary>Optional note when a coach waives a charge.</summary>
public sealed record RidePaymentNote(string? Note = null);

/// <summary>A coach's ledger totals for one group (booked only on settled rows, except Outstanding).</summary>
public sealed record RidePaymentSummary(
    Guid SquadId,
    string Currency,
    int Count,
    int PaidCount,
    long GrossMinor,         // owed + paid (excludes waived)
    long CollectedMinor,     // sum where status = paid
    long ClubCutMinor,       // club's cut on collected
    long CoachNetMinor,      // coach net on collected
    long OutstandingMinor);  // owed, not yet paid

/// <summary>Ride-payment ledger: record, list, settle, waive. No money moves — status tracking only.</summary>
public interface IPaymentService
{
    /// <summary>Record a payment the caller (rider) owes the group's coach. Returns null if the squad
    /// doesn't exist or has no owner to pay.</summary>
    Task<RidePayment?> CreateAsync(RidePaymentCreate body, Guid payerId, CancellationToken ct);

    /// <summary>The caller's own ride payments, newest first.</summary>
    Task<IReadOnlyList<RidePayment>> ListForPayerAsync(Guid payerId, CancellationToken ct);

    /// <summary>The ledger for one group. Owner/coach only — returns null if the caller doesn't own it.</summary>
    Task<IReadOnlyList<RidePayment>?> ListForSquadAsync(Guid squadId, Guid ownerId, CancellationToken ct);

    /// <summary>Ledger totals for one group. Owner/coach only — returns null if the caller doesn't own it.</summary>
    Task<RidePaymentSummary?> SummaryForSquadAsync(Guid squadId, Guid ownerId, CancellationToken ct);

    /// <summary>Mark a payment settled. Allowed for the payer or the coach. Returns the updated row,
    /// or null if not found, already waived, or the caller is neither party.</summary>
    Task<RidePayment?> MarkPaidAsync(Guid paymentId, Guid actorId, string method, string? note, CancellationToken ct);

    /// <summary>Coach waives a charge (no money owed). Returns the updated row, or null if the caller
    /// isn't the coach / it doesn't exist.</summary>
    Task<RidePayment?> WaiveAsync(Guid paymentId, Guid coachId, string? note, CancellationToken ct);
}
