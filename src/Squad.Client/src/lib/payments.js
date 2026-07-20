// Ride-payment ledger API. Thin fetch wrappers; the caller supplies the bearer token.
// The app tracks payment *status* only — coaches collect the money out-of-band
// (e-transfer / cash / their own link). Amounts are integer minor units (agorot/cents).

async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// Rider side.
// body: { squadId, kind: 'member'|'dropin'|'coach', amountMinor, currency?, clubFeeBps?, note? }
export const recordPayment = (token, body) => req('/api/payments', { method: 'POST', token, body });
export const listMyPayments = (token) => req('/api/payments/mine', { token });

// Either party confirms the money changed hands. method: 'etransfer'|'cash'|'link'|'other'
export const markPaymentPaid = (token, id, method, note) =>
  req(`/api/payments/${id}/paid`, { method: 'POST', token, body: { method, note } });

// Coach side (owner-only).
export const listSquadPayments = (token, squadId) => req(`/api/payments/squad/${squadId}`, { token });
export const squadPaymentSummary = (token, squadId) => req(`/api/payments/squad/${squadId}/summary`, { token });
export const waivePayment = (token, id, note) =>
  req(`/api/payments/${id}/waive`, { method: 'POST', token, body: { note } });

// Display helper: minor units (agorot/cents) + ISO currency → a symbol string.
const SYMBOLS = { ILS: '₪', USD: '$', EUR: '€', GBP: '£', CAD: 'C$' };
export function formatMinor(amountMinor, currency = 'ILS') {
  const sym = SYMBOLS[currency] || `${currency} `;
  const major = (amountMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${sym}${major}`;
}
