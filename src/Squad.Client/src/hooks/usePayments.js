import { useCallback, useEffect, useState } from 'react';
import { listSquadPayments, squadPaymentSummary, listMyPayments } from '../lib/payments.js';

// Coach ledger for one squad: the payment rows + booked totals. Owner-only server-side
// (a non-owner gets 404 → status 'error'). Refetch after mark-paid / waive.
export function useSquadLedger({ getToken, squadId, enabled = true, refreshSignal } = {}) {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  const refetch = useCallback(async () => {
    if (!enabled || !squadId) return;
    try {
      const token = getToken ? await getToken() : null;
      const [r, sum] = await Promise.all([
        listSquadPayments(token, squadId),
        squadPaymentSummary(token, squadId),
      ]);
      setRows(Array.isArray(r) ? r : []);
      setSummary(sum || null);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getToken, squadId, enabled]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { rows, summary, status, refetch };
}

// The signed-in rider's own payment history.
export function useMyPayments({ getToken, enabled = true, refreshSignal } = {}) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('loading');

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      const token = getToken ? await getToken() : null;
      const r = await listMyPayments(token);
      setRows(Array.isArray(r) ? r : []);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [getToken, enabled]);

  useEffect(() => { refetch(); }, [refetch, refreshSignal]);

  return { rows, status, refetch };
}
