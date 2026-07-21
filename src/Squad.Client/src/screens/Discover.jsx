import { useEffect, useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import AuthedImage from '../components/AuthedImage.jsx';

// Group bike glyph, reused as the tile mark on each club row (fallback when no logo).
const GroupBike = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0c0e11" strokeWidth="2.2" strokeLinecap="round">
    <circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" />
    <path d="M15 17.5l-3-6.5H8.5m6.5 0l-2.5 6.5M9.5 6.5h3l2 4.5" />
  </svg>
);

// Club tile: the uploaded logo when set, else the colour-filled bike glyph.
const GroupMark = ({ g, token }) => (
  g.logoUrl
    ? <AuthedImage url={g.logoUrl} token={token} style="width:46px;height:46px;border-radius:13px;flex:none" />
    : <div style={s(`width:46px;height:46px;border-radius:13px;background:${g.color};flex:none;display:flex;align-items:center;justify-content:center`)}><GroupBike /></div>
);

// Chip label → the discipline it keeps. 'All' matches everything; the rest match a
// club whose `disc` string contains the chip (so "Triathlon" catches "Triathlon", etc.).
const filters = ['All', 'Cycling', 'Triathlon', 'Swim'];

export default function Discover({ vm, actions, getToken }) {
  const [token, setToken] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('All');
  useEffect(() => {
    let ok = true;
    Promise.resolve(getToken?.()).then((t) => { if (ok) setToken(t || null); });
    return () => { ok = false; };
  }, [getToken]);

  // Client-side search + discipline filter over the loaded groups. Case-insensitive
  // free-text over name / location / discipline, ANDed with the active chip.
  const groups = vm.nearbyGroups;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      const byChip = active === 'All' || (g.disc || '').toLowerCase().includes(active.toLowerCase());
      const byText = !q || [g.name, g.loc, g.disc].some((v) => (v || '').toLowerCase().includes(q));
      return byChip && byText;
    });
  }, [groups, query, active]);

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* title lives in the global app header; keep the location tag */}
      <div style={s('display:flex;align-items:center;justify-content:flex-end')}>
        <div style={s('display:flex;align-items:center;gap:5px;font-size:11px;color:var(--accent);font-weight:600')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 21s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>
          Northern
        </div>
      </div>

      {/* club-vs-club ranking entry — this week's cross-club board */}
      <div className="ctl" onClick={() => actions.go('clubrank')} style={s('display:flex;align-items:center;gap:11px;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:16px;padding:13px 14px;margin-top:10px')}>
        <div style={s('width:38px;height:38px;border-radius:11px;background:var(--accent);flex:none;display:flex;align-items:center;justify-content:center')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M6 4h12v5a6 6 0 0 1-12 0V4zM6 6H3v2a3 3 0 0 0 3 3M18 6h3v2a3 3 0 0 1-3 3" /></svg>
        </div>
        <div style={s('flex:1;min-width:0')}><div style={s('font-size:13.5px;font-weight:700')}>Club Ranking</div><div style={s('font-size:11.5px;color:var(--text2)')}>See how clubs stack up this week</div></div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {/* search */}
      <div style={s('display:flex;align-items:center;gap:9px;background:var(--bg2);border:1px solid var(--line);border-radius:13px;padding:11px 13px;margin-top:12px')}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <input
          className="dsearch"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clubs, sport, city…"
          autoComplete="off"
          style={s('flex:1;min-width:0;background:transparent;border:none;outline:none;padding:0;font-size:13px;color:var(--text);font-family:inherit')}
        />
        {query && (
          <div className="ctl" onClick={() => setQuery('')} aria-label="Clear search" style={s('flex:none;display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:var(--bg4);color:var(--text3)')}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </div>
        )}
      </div>

      {/* filters */}
      <div style={s('display:flex;gap:7px;margin-top:12px;flex-wrap:wrap')}>
        {filters.map((f) => {
          const on = active === f;
          return (
            <div key={f} className="ctl" onClick={() => setActive(f)} style={s('padding:6px 12px;border-radius:9px;font-size:11.5px;font-weight:600;' + (on ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'))}>{f}</div>
          );
        })}
      </div>

      {/* group list */}
      <div style={s('display:flex;flex-direction:column;gap:11px;margin-top:16px')}>
        {groups.length === 0 && (
          <EmptyState icon="🔍" title="No groups nearby" sub="New clubs and coached groups will appear here as they join." />
        )}
        {groups.length > 0 && shown.length === 0 && (
          <EmptyState icon="🔍" title="No matches" sub="Try a different search or clear the filters to see every group." />
        )}
        {shown.map((g) => (
          <div key={g.id} className="ctl" onClick={() => actions.openGroup(g.id)} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;gap:12px;align-items:center')}>
            <GroupMark g={g} token={token} />
            <div style={s('flex:1;min-width:0')}>
              <div style={s('display:flex;align-items:center;gap:6px')}>
                <span style={s('font-size:14.5px;font-weight:700')}>{g.name}</span>
                {g.member && <span style={s('font-size:9px;font-weight:700;color:var(--good);background:color-mix(in srgb,var(--good) 15%,transparent);padding:1px 6px;border-radius:5px;text-transform:uppercase')}>Member</span>}
              </div>
              <div style={s('font-size:11.5px;color:var(--text2);margin-top:1px')}>{g.loc}</div>
              <div style={s('display:flex;gap:9px;margin-top:6px;font-size:10.5px;color:var(--text3)')}><span>★ {g.rating}</span><span>· {g.members} riders</span><span>· {g.disc}</span></div>
            </div>
            <div style={s('text-align:right;flex:none')}>
              <div style={s('font-size:9.5px;font-weight:700;padding:3px 8px;border-radius:7px;' + g.badgeStyle)}><span className="mono">{g.price}</span>{g.per}</div>
              <div style={s('font-size:10px;color:var(--text3);margin-top:6px')}>{g.level}</div>
            </div>
          </div>
        ))}
      </div>

      {/* coach CTA: register your own club */}
      <div className="ctl" onClick={() => actions.go('newgroup')} style={s('display:flex;align-items:center;gap:11px;background:var(--bg2);border:1px dashed var(--line2);border-radius:16px;padding:14px;margin-top:14px')}>
        <div style={s('width:38px;height:38px;border-radius:11px;background:var(--accent-dim);flex:none;display:flex;align-items:center;justify-content:center')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </div>
        <div style={s('flex:1')}><div style={s('font-size:13.5px;font-weight:700')}>Coach a group?</div><div style={s('font-size:11.5px;color:var(--text2)')}>Register your own club on Squad</div></div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6" /></svg>
      </div>
    </div>
  );
}
