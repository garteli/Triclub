import { useState } from 'react';
import { s } from '../lib/style.js';
import { useHealthSync } from '../hooks/useHealthSync.js';

// Apple logo mark (monochrome, inherits the accent).
const AppleGlyph = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--accent)" aria-hidden="true">
    <path d="M16.4 12.9c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9s-1.8-.9-3-.8c-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.9zM14.2 5.9c.6-.8 1-1.9.9-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.8 1.1.1 2.2-.5 2.9-1.2z" />
  </svg>
);

const RANGES = [
  { key: '90d', label: '90 days', since: () => new Date(Date.now() - 90 * 864e5) },
  { key: '1y', label: '1 year', since: () => new Date(Date.now() - 365 * 864e5) },
  { key: 'all', label: 'All time', since: () => new Date(0) },
];

// "Connect Apple Health" panel for the Upload screen. On web it renders a disabled,
// explanatory state (HealthKit is iOS-app-only); on the native iOS build it drives a
// real HealthKit history import through the same ingest pipeline as .fit uploads.
export default function AppleHealthSync({ getToken, onDataChanged }) {
  const [range, setRange] = useState('1y');
  const { available, status, progress, summary, error, run } = useHealthSync({ getToken, onDataChanged });
  const syncing = status === 'syncing';

  const start = () => run({ since: RANGES.find((r) => r.key === range).since() });

  return (
    <div style={s('padding:0 18px 120px;margin-top:18px;animation:floatUp .35s ease')}>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600;margin-bottom:8px')}>Or connect a source</div>

      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:15px 15px 16px')}>
        <div style={s('display:flex;align-items:center;gap:12px')}>
          <div style={s('width:44px;height:44px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--accent) 15%,transparent)')}><AppleGlyph /></div>
          <div style={s('flex:1;min-width:0')}>
            <div style={s('font-size:14.5px;font-weight:700')}>Apple Health</div>
            <div style={s('font-size:11.5px;color:var(--text3)')}>Import your workout history from HealthKit</div>
          </div>
        </div>

        {!available ? (
          <div style={s('font-size:11.5px;color:var(--text3);margin-top:12px;line-height:1.5')}>
            Apple Health lives on your iPhone, so this works in the <b>Domestique Team iOS app</b> — not the web version. Install the app and open this screen there to sync.
          </div>
        ) : (
          <>
            {/* range selector */}
            <div style={s('display:flex;gap:6px;margin-top:13px')}>
              {RANGES.map((r) => (
                <div
                  key={r.key}
                  onClick={() => !syncing && setRange(r.key)}
                  style={s(`flex:1;text-align:center;font-size:12px;font-weight:600;padding:7px 0;border-radius:9px;cursor:${syncing ? 'default' : 'pointer'};transition:all .12s;border:1px solid ${range === r.key ? 'var(--accent)' : 'var(--line2)'};color:${range === r.key ? 'var(--accent-ink)' : 'var(--text2)'};background:${range === r.key ? 'var(--accent)' : 'transparent'};opacity:${syncing ? 0.5 : 1}`)}
                >{r.label}</div>
              ))}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => !syncing && start()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && !syncing && start()}
              style={s(`margin-top:11px;text-align:center;font-size:14px;font-weight:700;padding:12px 0;border-radius:12px;cursor:${syncing ? 'default' : 'pointer'};color:var(--accent-ink);background:var(--accent);opacity:${syncing ? 0.7 : 1};transition:opacity .15s`)}
            >
              {syncing ? `Syncing… ${progress?.done ?? 0}/${progress?.total ?? 0}` : 'Sync Apple Health'}
            </div>

            {syncing && progress?.total > 0 && (
              <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:11px;overflow:hidden')}>
                <div style={s(`height:100%;width:${Math.round((progress.done / progress.total) * 100)}%;background:var(--accent);border-radius:3px;transition:width .2s`)} />
              </div>
            )}

            {status === 'done' && summary && (
              <div style={s('font-size:11.5px;color:var(--text2);margin-top:11px;line-height:1.5')}>
                {summary.total === 0
                  ? 'No workouts found in that range.'
                  : <>Imported <b style={s('color:var(--good)')}>{summary.queued}</b> workout{summary.queued === 1 ? '' : 's'}
                      {summary.duplicates > 0 && <> · {summary.duplicates} already had</>}
                      {summary.failed > 0 && <> · <span style={s('color:var(--bad)')}>{summary.failed} failed</span></>}.
                      {summary.queued > 0 && ' They’ll appear in the feed once processed.'}</>}
              </div>
            )}
            {status === 'error' && (
              <div style={s('font-size:11.5px;color:var(--bad);margin-top:11px')}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
