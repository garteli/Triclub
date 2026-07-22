import { useEffect, useState } from 'react';
import { s } from '../lib/style.js';
import EmptyState from '../components/EmptyState.jsx';
import { FAMILY, familyOf } from '../lib/disciplines.js';

// Decorative club glyphs — the shapes the design draws for each club logo. The server
// picks one deterministically per club (ClubRankingRow.Emblem); we just render it.
const EMBLEM_PATHS = {
  peak: '<path d="M2 20 L8 8 L12 14 L16 6 L22 20 Z"/>',
  wave: '<path d="M2 14 q3 -4 6 0 t6 0 t6 0" fill="none" stroke-width="2.4"/><path d="M2 18 q3 -4 6 0 t6 0 t6 0" fill="none" stroke-width="2.4" opacity=".6"/>',
  wheel: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.2"/><circle cx="12" cy="12" r="2"/><path d="M12 4v4M12 16v4M4 12h4M16 12h4" stroke-width="1.8"/>',
  bolt: '<path d="M13 3 L5 13 h5 l-1 8 L18 10 h-5 z"/>',
};

function ClubLogo({ emblem, color, size }) {
  const px = parseInt(size, 10);
  return (
    <div style={s(`width:${size};height:${size};border-radius:26%;background:color-mix(in srgb,${color} 16%,var(--bg));border:1.5px solid ${color};display:flex;align-items:center;justify-content:center;flex:none`)}>
      <svg viewBox="0 0 24 24" width={Math.min(22, Math.round(px * 0.6))} height={Math.min(22, Math.round(px * 0.6))}
        fill={color} stroke={color} strokeLinecap="round" strokeLinejoin="round"
        dangerouslySetInnerHTML={{ __html: EMBLEM_PATHS[emblem] || EMBLEM_PATHS.peak }} />
    </div>
  );
}

const TAB_DEFS = [['load', 'Load'], ['vol', 'Volume'], ['members', 'Athletes'], ['streak', 'Avg streak']];

export default function ClubRanking({ clubRanking }) {
  const [tab, setTab] = useState('load');
  const [fam, setFam] = useState(null);   // null = auto (the caller's own family)
  const [disc, setDisc] = useState('All');
  const rows = clubRanking?.rows ?? [];

  // Open the board on the caller's own family once rows arrive (so it lands on "clubs
  // like mine"), unless they've already switched. Picking a family cancels the auto-pick.
  const [autoPicked, setAutoPicked] = useState(false);
  useEffect(() => {
    if (autoPicked) return;
    const mine = rows.find((r) => r.you)?.disc;
    if (mine) { setFam(familyOf(mine)); setAutoPicked(true); }
  }, [rows, autoPicked]);

  // Endurance and motorsport clubs rank apart. Families present on the board → the
  // top-level switch; the active one falls back to the first present.
  const famList = Array.from(new Set(rows.map((r) => familyOf(r.disc))));
  const activeFam = fam ?? famList[0] ?? 'endurance';

  // Within the active family: discipline chips for the disciplines that field a club.
  const discList = ['All', ...Array.from(new Set(rows.filter((r) => familyOf(r.disc) === activeFam).map((r) => r.disc)))];
  // Rank same-family (and, when a discipline chip is picked, same-discipline) peers.
  const scoped = rows.filter((r) => familyOf(r.disc) === activeFam && (disc === 'All' || r.disc === disc));

  // Real days until the weekly board resets (next Monday). Mon=0..Sun=6.
  const dayIdx = (new Date().getDay() + 6) % 7;
  const daysToReset = 7 - dayIdx;

  const valOf = (r) => (tab === 'load' ? r.load : tab === 'vol' ? r.vol : tab === 'members' ? r.members : r.streak);
  const sortKey = (r) => (tab === 'vol' ? r.volHours : tab === 'members' ? r.members : tab === 'streak' ? r.streak : r.load);
  const unit = tab === 'streak' ? 'd' : '';

  const sorted = [...scoped].sort((a, b) => sortKey(b) - sortKey(a));
  const maxV = Math.max(1, ...sorted.map(sortKey));
  // Load leader gets the 🔥 badge; the caller's own club gets ⚡ (as in the design's first rows).
  const loadLeaderId = [...scoped].sort((a, b) => b.load - a.load)[0]?.id;
  const lbRows = sorted.map((r, i) => {
    const rank = i + 1;
    return {
      ...r, rank, val: valOf(r),
      barPct: Math.round((sortKey(r) / maxV) * 100),
      badge: r.you ? '⚡' : (r.id === loadLeaderId ? '🔥' : ''),
      moveIcon: r.move > 0 ? '▲' : r.move < 0 ? '▼' : '—',
      moveColor: r.move > 0 ? 'var(--good)' : r.move < 0 ? 'var(--bad)' : 'var(--text3)',
      rankColor: r.you ? 'var(--accent)' : 'var(--text2)',
      barColor: r.you ? 'var(--accent)' : 'var(--text3)',
      rowStyle: r.you
        ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)'
        : 'background:var(--bg2);border:1px solid var(--line)',
      podSize: rank === 1 ? '56px' : '46px',
      podBadgeBg: rank === 1 ? 'var(--accent)' : 'var(--bg4)',
      podBadgeColor: rank === 1 ? 'var(--accent-ink)' : 'var(--text)',
      pedestalH: rank === 1 ? '56px' : rank === 2 ? '40px' : '28px',
    };
  });
  const podium = [lbRows[1], lbRows[0], lbRows[2]].filter(Boolean);

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('display:flex;align-items:center;justify-content:space-between;margin-bottom:6px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>This week · club vs club</div>
          <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px')}>Club Ranking</div>
        </div>
        <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:11px;padding:7px 10px;text-align:center')}>
          <div className="mono" style={s('font-size:13px;font-weight:700;color:var(--accent)')}>{daysToReset}d</div>
          <div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>resets</div>
        </div>
      </div>

      {/* family switch — endurance and motorsport clubs are ranked apart */}
      {famList.length > 1 && (
        <div style={s('display:flex;gap:6px;margin-top:14px;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:4px')}>
          {famList.map((f) => {
            const on = activeFam === f;
            return (
              <div key={f} className="ctl" onClick={() => { setFam(f); setDisc('All'); setAutoPicked(true); }}
                style={s('flex:1;text-align:center;padding:8px 10px;border-radius:9px;font-size:12.5px;font-weight:700;' + (on ? `background:${FAMILY[f].accent};color:#0c0e11` : 'color:var(--text2)'))}>{FAMILY[f].label}</div>
            );
          })}
        </div>
      )}

      {/* discipline scope — rank clubs against same-discipline peers within the family */}
      {discList.length > 2 && (
        <div className="hscroll" style={s('display:flex;gap:7px;overflow-x:auto;margin:14px -18px 0;padding:0 18px 4px')}>
          {discList.map((d) => (
            <div key={d} className="ctl" onClick={() => { setDisc(d); setAutoPicked(true); }}
              style={s(`flex:none;padding:7px 13px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;${disc === d ? 'background:var(--text);color:var(--bg)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'}`)}>{d === 'All' ? 'All disciplines' : d}</div>
          ))}
        </div>
      )}

      {/* metric tabs */}
      <div className="hscroll" style={s('display:flex;gap:7px;overflow-x:auto;margin:14px -18px 0;padding:0 18px 4px')}>
        {TAB_DEFS.map(([id, label]) => (
          <div key={id} className="ctl" onClick={() => setTab(id)}
            style={s(`flex:none;padding:8px 14px;border-radius:11px;font-size:12.5px;font-weight:600;white-space:nowrap;${tab === id ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'}`)}>{label}</div>
        ))}
      </div>

      {lbRows.length === 0 && (
        <EmptyState icon="🏆" title="No club rankings yet" sub="Once clubs log activities this week, the standings appear here." />
      )}

      {lbRows.length > 0 && <>
      {/* podium */}
      <div style={s('display:flex;align-items:flex-end;gap:8px;margin-top:20px')}>
        {podium.map((p) => (
          <div key={p.id} style={s('flex:1;text-align:center')}>
            <div style={s('position:relative;display:flex;align-items:center;justify-content:center;margin:0 auto 8px')}>
              <ClubLogo emblem={p.emblem} color={p.color} size={p.podSize} />
              <div style={s(`position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);width:20px;height:20px;border-radius:50%;z-index:2;background:${p.podBadgeBg};color:${p.podBadgeColor};display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:2px solid var(--bg)`)}>{p.rank}</div>
            </div>
            <div style={s('font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{p.name}</div>
            <div className="mono" style={s('font-size:15px;font-weight:700;color:var(--accent)')}>{p.val}</div>
            <div style={s(`height:${p.pedestalH};background:linear-gradient(180deg,var(--bg3),var(--bg2));border:1px solid var(--line);border-bottom:none;border-radius:10px 10px 0 0;margin-top:8px`)} />
          </div>
        ))}
      </div>

      {/* rows */}
      <div style={s('display:flex;flex-direction:column;gap:8px;margin-top:6px')}>
        {lbRows.map((r) => (
          <div key={r.id} style={s(`${r.rowStyle};border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:11px`)}>
            <div className="mono" style={s(`width:18px;text-align:center;font-size:14px;font-weight:700;color:${r.rankColor}`)}>{r.rank}</div>
            <ClubLogo emblem={r.emblem} color={r.color} size="36px" />
            <div style={s('flex:1;min-width:0')}>
              <div style={s('display:flex;align-items:center;gap:6px')}>
                <span style={s('font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{r.name}</span>
                <span style={s('font-size:12px')}>{r.badge}</span>
              </div>
              <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:5px;overflow:hidden')}><div style={s(`height:100%;width:${r.barPct}%;background:${r.barColor};border-radius:3px`)} /></div>
            </div>
            <div style={s('text-align:right;flex:none')}>
              <div className="mono" style={s('font-size:15px;font-weight:700')}>{r.val}<span style={s('font-size:10px;color:var(--text3)')}>{unit}</span></div>
              <div style={s(`font-size:11px;font-weight:700;color:${r.moveColor}`)}>{r.moveIcon}</div>
            </div>
          </div>
        ))}
      </div>
      </>}
    </div>
  );
}
