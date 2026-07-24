import { useMemo, useState } from 'react';
import { s } from '../lib/style.js';
import Avatar from '../components/Avatar.jsx';
import { useProfilePage } from '../hooks/useProfilePage.js';
import { useConfirm } from '../components/ConfirmModal.jsx';

// Your own profile — all real. Identity + this-week standing (streak / squad rank) come
// from the backend; every stat, chart, PB and badge below is derived from your actual
// activities (GET /api/profile/page). The goal race is set from an event link that the
// AI reads. Sections with no data are omitted rather than filled with samples — real
// data or an empty state, never fake.

const eyebrow = 'font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.3px;font-weight:600';
const SPORT_COLOR = { Bike: 'var(--bike)', Run: 'var(--run)', Swim: 'var(--swim)', Other: 'var(--gym)' };

const SquadLogo = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
    <g stroke="#fff" strokeWidth="6" strokeLinecap="round">
      <path d="M13 44 L23 30" /><path d="M25 46 L35 32" opacity=".85" /><path d="M37 48 L47 34" opacity=".55" />
    </g>
    <circle cx="49.5" cy="20.5" r="4.6" fill="#fff" />
  </svg>
);

const fmtInt = (n) => (n == null ? '0' : Math.round(n).toLocaleString('en-US'));
const fmtKm = (n) => (n == null ? '0' : (n >= 100 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString('en-US'));

function goalCountdown(goal) {
  const d = goal?.daysToGo;
  if (d == null) return { big: '—', small: 'date TBC' };
  if (d > 0) return { big: String(d), small: 'days to go' };
  if (d === 0) return { big: '0', small: 'race day!' };
  return { big: '✓', small: 'completed' };
}

export default function Profile({ vm, actions, getToken, onLeaveSquad }) {
  const me = vm.me || {};
  const { page, status, setGoal, clearGoal, refetch } = useProfilePage({ getToken, enabled: !!getToken });
  const confirm = useConfirm();

  // Leave a club (with a confirmation modal). The server refuses if you own it, and moves you
  // back to your personal space if it was your active club; refresh the app + this page after.
  const askLeave = (club) => confirm.open({
    title: `Leave ${club.name}?`,
    body: club.isActive
      ? `You'll be removed from ${club.name} and moved back to your personal space. You can ask to re-join later.`
      : `You'll be removed from ${club.name}. You can ask to re-join later.`,
    confirmLabel: 'Leave group',
    run: async () => {
      if (onLeaveSquad) await onLeaveSquad(club.squadId);
      await refetch();
    },
  });

  const sub = [page?.club ?? me.club, (page?.ageGroup ?? me.ageGroup) && `Age-group ${page?.ageGroup ?? me.ageGroup}`]
    .filter(Boolean).join(' · ');
  const streak = page?.streak;
  const rank = page?.rank;

  const followStats = page ? [
    { k: 'Following', v: fmtInt(page.following) },
    { k: 'Followers', v: fmtInt(page.followers) },
    { k: 'Activities', v: fmtInt(page.activityCount) },
    { k: 'This year', v: `${fmtKm(page.yearDistanceKm)} km` },
  ] : [];

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* header */}
      <div style={s('display:flex;align-items:flex-start;gap:14px')}>
        <Avatar photo={me.photo} initials={page?.initials || me.initials} color={page?.color || me.color} size={66} radius={20} fontSize={23} />
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:22px;font-weight:700;letter-spacing:-.4px')}>{page?.name || me.name || 'Your name'}</div>
          {sub && <div style={s('font-size:12.5px;color:var(--text2)')}>{sub}</div>}
          {(streak > 0 || rank > 0) && (
            <div style={s('display:flex;gap:6px;margin-top:7px;flex-wrap:wrap')}>
              {streak > 0 && <span style={s('font-size:10px;font-weight:700;color:var(--accent-ink);background:var(--accent);padding:2px 8px;border-radius:6px')}>⚡ {streak}-day streak</span>}
              {rank > 0 && <span style={s('font-size:10px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 8px;border-radius:6px')}>Squad rank #{rank}</span>}
            </div>
          )}
        </div>
        <div className="ctl" onClick={() => actions?.go('settings')} style={s('width:34px;height:34px;border-radius:11px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;flex:none')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
        </div>
      </div>

      {/* follow / totals strip — real counts + distance */}
      {followStats.length > 0 && (
        <div style={s('display:flex;background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:12px 6px;margin-top:16px')}>
          {followStats.map((f, i) => (
            <div key={f.k} style={s(`flex:1;text-align:center;${i < followStats.length - 1 ? 'border-right:1px solid var(--line)' : ''}`)}>
              <div className="mono" style={s('font-size:16px;font-weight:700')}>{f.v}</div>
              <div style={s('font-size:9.5px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-top:2px')}>{f.k}</div>
            </div>
          ))}
        </div>
      )}

      {/* actions */}
      <div style={s('display:flex;gap:10px;margin-top:10px')}>
        <div className="ctl" onClick={() => actions?.go('editprofile')} style={s('flex:1;text-align:center;background:var(--bg2);border:1px solid var(--line);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--text)')}>Edit profile</div>
        <div className="ctl" onClick={() => actions?.go('activities')} style={s('flex:1;text-align:center;background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:12px;padding:11px;font-size:12.5px;font-weight:700;color:var(--accent)')}>My activities</div>
      </div>

      {/* goal race — set from an event URL (AI extracts the details) */}
      <GoalSection goal={page?.goal} ready={status === 'ready'} onSet={setGoal} onClear={clearGoal} />

      {/* weekly volume, stacked by discipline */}
      <WeeklyVolume weeks={page?.weekVolumes} delta={page?.weekHoursDelta} />

      {/* fitness trend (CTL / ATL) */}
      <FitnessTrend fitness={page?.fitness} ctl={page?.ctl} atl={page?.atl} tsb={page?.tsb} />

      {/* trophy case */}
      {page?.achievements?.length > 0 && (
        <>
          <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
            <div style={s(eyebrow)}>Trophy case</div>
            <div style={s('font-size:11px;color:var(--text2)')}>{page.achievements.length} earned</div>
          </div>
          <div className="hscroll" style={s('display:flex;gap:12px;overflow-x:auto;padding:2px 18px 4px;margin:0 -18px')}>
            {page.achievements.map((t, i) => (
              <div key={i} style={s('width:88px;flex:none;text-align:center')}>
                <div style={s(`width:58px;height:58px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${(t.badge || '').length > 2 ? 16 : 22}px;color:var(--accent-ink);background:var(--accent);box-shadow:0 8px 20px -8px var(--accent);margin:0 auto`)}>{t.badge}</div>
                <div style={s('font-size:11.5px;font-weight:700;margin-top:8px')}>{t.title}</div>
                <div style={s('font-size:10px;color:var(--text3);margin-top:1px')}>{t.sub}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* personal bests */}
      {page?.personalBests?.length > 0 && (
        <>
          <div style={s(eyebrow + ';margin:22px 2px 12px')}>Personal bests</div>
          <div style={s('display:grid;grid-template-columns:1fr 1fr;gap:10px')}>
            {page.personalBests.map((p) => (
              <div key={p.label} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:15px;padding:13px 14px;position:relative;overflow:hidden')}>
                <div style={s(`position:absolute;right:0;top:0;bottom:0;width:3px;background:${SPORT_COLOR[p.sport] || 'var(--accent)'}`)} />
                <div style={s('font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;font-weight:600')}>{p.label}</div>
                <div className="mono" style={s('font-size:24px;font-weight:700;margin-top:4px')}>{p.value}{p.unit && <span style={s('font-size:12px;color:var(--text2)')}> {p.unit}</span>}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* this block · by discipline — endurance only; the swim/bike/run split is
          meaningless for a motorsport club, so it's hidden there (see vm.family). */}
      {vm.family === 'endurance' && <DisciplineBreakdown disciplines={page?.disciplines} />}

      {/* my clubs — every club I'm a member of, with self-leave (confirmation) */}
      <MyClubs
        memberships={page?.memberships}
        ready={status === 'ready'}
        fallbackName={page?.squadName || me.club}
        fallbackMembers={page?.squadMembers}
        activeClubId={vm.activeClubId}
        rank={rank}
        actions={actions}
        onLeave={askLeave}
      />

      {confirm.node}
    </div>
  );
}

// ── my clubs (all memberships + self-leave) ───────────────────────────────────
function MyClubs({ memberships, ready, fallbackName, fallbackMembers, activeClubId, rank, actions, onLeave }) {
  const clubs = memberships || [];

  // Until the page has loaded we don't know the memberships — show the active club as a
  // single card (from the older fields) so the section never flashes empty.
  if (!ready && clubs.length === 0) {
    if (!fallbackName) return null;
    return (
      <>
        <div style={s(eyebrow + ';margin:22px 2px 12px')}>My clubs</div>
        <ClubCard
          name={fallbackName}
          sub={[fallbackMembers > 0 ? `${fallbackMembers} athlete${fallbackMembers === 1 ? '' : 's'}` : null, rank > 0 ? `Rank #${rank} this week` : null].filter(Boolean).join(' · ')}
          onOpen={() => (activeClubId ? actions?.openGroup(activeClubId) : null)}
        />
      </>
    );
  }

  return (
    <>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>My clubs</div>
        <div className="ctl" onClick={() => actions?.go('discover')} style={s('font-size:11px;font-weight:700;color:var(--accent)')}>Find groups</div>
      </div>

      {clubs.length === 0 ? (
        <div className="ctl" onClick={() => actions?.go('discover')} style={s('border:1.5px dashed var(--line2);border-radius:16px;padding:16px 15px;background:var(--bg2)')}>
          <div style={s('font-size:13.5px;font-weight:700')}>You haven't joined a club yet</div>
          <div style={s('font-size:11.5px;color:var(--text2);margin-top:2px')}>Discover groups near you and ask to join.</div>
        </div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:10px')}>
          {clubs.map((c) => (
            <ClubCard
              key={c.squadId}
              name={c.name}
              logoUrl={c.logoUrl}
              color={c.color}
              active={c.isActive}
              role={c.isOwner ? 'owner' : c.role}
              sub={[`${c.members} athlete${c.members === 1 ? '' : 's'}`, c.discipline].filter(Boolean).join(' · ')}
              onOpen={() => actions?.openGroup(c.squadId)}
              onLeave={c.isOwner ? null : () => onLeave(c)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ClubCard({ name, sub, logoUrl, color, active, role, onOpen, onLeave }) {
  const roleChip = role === 'owner' ? 'Owner' : role === 'coach' ? 'Coach' : null;
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:13px 14px;display:flex;align-items:center;gap:12px')}>
      <div className="ctl" onClick={onOpen} style={s('display:flex;align-items:center;gap:12px;flex:1;min-width:0')}>
        <div style={s(`width:44px;height:44px;border-radius:13px;flex:none;display:flex;align-items:center;justify-content:center;overflow:hidden;${logoUrl ? '' : `background:linear-gradient(135deg,${color || '#ff8a3d'},#ef5f1f)`}`)}>
          {logoUrl ? <img src={logoUrl} alt="" style={s('width:100%;height:100%;object-fit:cover')} /> : <SquadLogo />}
        </div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('display:flex;align-items:center;gap:7px')}>
            <div style={s('font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{name}</div>
            {active && <span style={s('flex:none;font-size:9px;font-weight:800;color:var(--accent-ink);background:var(--accent);padding:2px 7px;border-radius:6px;text-transform:uppercase;letter-spacing:.5px')}>Active</span>}
            {roleChip && <span style={s('flex:none;font-size:9px;font-weight:700;color:var(--text2);background:var(--bg3);border:1px solid var(--line);padding:2px 7px;border-radius:6px')}>{roleChip}</span>}
          </div>
          {sub && <div style={s('font-size:11.5px;color:var(--text2);margin-top:2px')}>{sub}</div>}
        </div>
      </div>
      {onLeave ? (
        <div className="ctl" onClick={onLeave} style={s('flex:none;padding:8px 12px;border-radius:10px;font-size:12px;font-weight:700;color:var(--bad);background:color-mix(in srgb,var(--bad) 12%,transparent);border:1px solid color-mix(in srgb,var(--bad) 30%,transparent)')}>Leave</div>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={s('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
      )}
    </div>
  );
}

// ── goal race card + set-by-URL flow ──────────────────────────────────────────
function GoalSection({ goal, ready, onSet, onClear }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(false);

  const submit = async () => {
    if (!url.trim() || busy) return;
    setBusy(true); setErr('');
    try {
      await onSet({ url: url.trim() });
      setUrl(''); setEditing(false);
    } catch (e) {
      setErr(e.message || "Couldn't look up that race.");
    } finally {
      setBusy(false);
    }
  };

  // Until the page has loaded we don't know whether a goal exists — stay quiet.
  if (!ready && !goal) return null;

  if (goal) {
    const { big, small } = goalCountdown(goal);
    const dateLine = [goal.date && new Date(goal.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' }), goal.location].filter(Boolean).join(' · ');
    return (
      <>
        <div style={s('background:linear-gradient(120deg,var(--accent),color-mix(in srgb,var(--accent) 55%,var(--swim)));border-radius:20px;padding:18px;margin-top:18px;color:#0c0e11;position:relative;overflow:hidden')}>
          <div style={s('position:absolute;right:-20px;bottom:-30px;font-size:120px;opacity:.14;line-height:1')}>🏁</div>
          <div style={s('display:flex;justify-content:space-between;align-items:flex-start')}>
            <div style={s('font-size:11px;text-transform:uppercase;letter-spacing:1.6px;font-weight:700;opacity:.75')}>Goal race</div>
            <div className="ctl" onClick={onClear} title="Remove goal" style={s('font-size:11px;font-weight:700;opacity:.7;cursor:pointer')}>Remove</div>
          </div>
          <div style={s('font-size:20px;font-weight:700;letter-spacing:-.3px;margin-top:2px')}>{goal.name}</div>
          <div style={s('display:flex;align-items:flex-end;gap:6px;margin-top:10px')}>
            <div className="mono" style={s('font-size:46px;font-weight:700;line-height:.85')}>{big}</div>
            <div style={s('font-size:14px;font-weight:700;margin-bottom:6px')}>{small}</div>
          </div>
          {dateLine && <div style={s('font-size:12px;font-weight:600;opacity:.75;margin-top:4px')}>{dateLine}</div>}
        </div>
        <div className="ctl" onClick={() => setEditing((v) => !v)} style={s('text-align:center;font-size:11.5px;font-weight:600;color:var(--accent);margin-top:8px')}>{editing ? 'Cancel' : 'Change goal race'}</div>
        {editing && <GoalForm url={url} setUrl={setUrl} busy={busy} err={err} submit={submit} />}
      </>
    );
  }

  // No goal yet — the empty state is the set-by-URL form.
  return (
    <>
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>Goal race</div>
      <div style={s('border:1.5px dashed var(--line2);border-radius:18px;padding:16px 15px;background:var(--bg2)')}>
        <div style={s('font-size:14px;font-weight:700')}>Set your goal race</div>
        <div style={s('font-size:11.5px;color:var(--text2);margin-top:2px;line-height:1.45')}>Paste a race or event link — the AI reads the page and pulls out the name, date and place.</div>
        <GoalForm url={url} setUrl={setUrl} busy={busy} err={err} submit={submit} />
      </div>
    </>
  );
}

function GoalForm({ url, setUrl, busy, err, submit }) {
  return (
    <div style={s('margin-top:12px')}>
      <div style={s('display:flex;gap:8px')}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="https://example.com/my-race"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={s('flex:1;min-width:0;background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:10px 12px;font-size:13px;color:var(--text);outline:none')}
        />
        <div className="ctl" onClick={submit} style={s(`flex:none;padding:10px 16px;border-radius:11px;font-size:12.5px;font-weight:700;background:var(--accent);color:var(--accent-ink);${busy || !url.trim() ? 'opacity:.5' : ''}`)}>{busy ? 'Reading…' : 'Add'}</div>
      </div>
      {busy && <div style={s('font-size:11px;color:var(--text3);margin-top:8px')}>Looking up the event…</div>}
      {err && <div style={s('font-size:11.5px;color:var(--bad);margin-top:8px')}>{err}</div>}
    </div>
  );
}

// ── weekly volume (stacked by discipline) ─────────────────────────────────────
function WeeklyVolume({ weeks, delta }) {
  const bars = useMemo(() => {
    if (!weeks?.length) return null;
    const totals = weeks.map((w) => w.swimHours + w.bikeHours + w.runHours + w.otherHours);
    const maxT = Math.max(...totals, 0.001);
    const H = 76;
    const px = (v) => (v > 0 ? Math.max(2, Math.round((v / maxT) * H)) : 0);
    return weeks.map((w, i) => ({
      swimH: px(w.swimHours), bikeH: px(w.bikeHours), runH: px(w.runHours), gymH: px(w.otherHours),
      cur: i === weeks.length - 1,
      op: i === weeks.length - 1 ? 1 : Number((0.42 + i * 0.055).toFixed(2)),
    }));
  }, [weeks]);

  if (!bars || bars.every((b) => !b.swimH && !b.bikeH && !b.runH && !b.gymH)) return null;

  return (
    <>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>Weekly volume · {bars.length} wk</div>
        {delta != null && delta !== 0 && (
          <div className="mono" style={s(`font-size:11px;color:${delta > 0 ? 'var(--good)' : 'var(--behind)'}`)}>{delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}h this wk</div>
        )}
      </div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:16px 14px 12px')}>
        <div style={s('display:flex;align-items:flex-end;gap:5px;height:82px')}>
          {bars.map((b, i) => (
            <div key={i} style={s(`flex:1;display:flex;flex-direction:column-reverse;gap:2px;opacity:${b.op}`)}>
              <div style={s(`height:${b.bikeH}px;background:var(--bike);border-radius:0 0 4px 4px`)} />
              <div style={s(`height:${b.runH}px;background:var(--run)`)} />
              <div style={s(`height:${b.swimH}px;background:var(--swim)`)} />
              <div style={s(`height:${b.gymH}px;background:var(--gym);border-radius:4px 4px 0 0`)} />
            </div>
          ))}
        </div>
        <div style={s('display:flex;gap:16px;margin-top:14px;padding-top:12px;border-top:1px solid var(--line);flex-wrap:wrap')}>
          {[['Bike', 'var(--bike)'], ['Run', 'var(--run)'], ['Swim', 'var(--swim)'], ['Other', 'var(--gym)']].map(([label, c]) => (
            <div key={label} style={s('display:flex;align-items:center;gap:5px;font-size:10.5px;color:var(--text2)')}><span style={s(`width:8px;height:8px;border-radius:2px;background:${c}`)} />{label}</div>
          ))}
        </div>
      </div>
    </>
  );
}

// ── fitness trend (CTL fitness / ATL fatigue) ─────────────────────────────────
function FitnessTrend({ fitness, ctl, atl, tsb }) {
  const paths = useMemo(() => {
    if (!fitness?.length) return null;
    const W = 320, top = 12, bot = 100;
    const vals = fitness.flatMap((p) => [p.ctl, p.atl]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const n = fitness.length;
    const x = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => bot - ((v - min) / span) * (bot - top);
    const line = (key) => fitness.map((p, i) => `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    const ctlLine = line('ctl');
    const area = `M0,${bot} L${ctlLine.replace(/ /g, ' L')} L${W},${bot} Z`;
    return { ctlLine, atlLine: line('atl'), area };
  }, [fitness]);

  if (!paths) return null;

  return (
    <>
      <div style={s('display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 12px')}>
        <div style={s(eyebrow)}>Fitness trend · {fitness.length >= 84 ? '12 wk' : `${Math.round(fitness.length / 7)} wk`}</div>
        <div style={s('font-size:11px;color:var(--text2)')}><span style={s('color:var(--accent)')}>●</span> Fitness <span style={s('color:var(--run);margin-left:6px')}>●</span> Fatigue</div>
      </div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:14px 12px 10px')}>
        <svg viewBox="0 0 320 110" style={s('width:100%;display:block')}>
          <defs><linearGradient id="ctlg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          <path d={paths.area} fill="url(#ctlg)" />
          <polyline points={paths.ctlLine} fill="none" stroke="var(--accent)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <polyline points={paths.atlLine} fill="none" stroke="var(--run)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
        </svg>
        <div style={s('display:flex;justify-content:space-between;margin-top:8px;padding:0 4px')}>
          <div><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--accent)')}>{Math.round(ctl)}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>CTL fitness</div></div>
          <div><div className="mono" style={s('font-size:16px;font-weight:700;color:var(--run)')}>{Math.round(atl)}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>ATL fatigue</div></div>
          <div><div className="mono" style={s(`font-size:16px;font-weight:700;color:${tsb >= 0 ? 'var(--good)' : 'var(--behind)'}`)}>{tsb > 0 ? '+' : ''}{Math.round(tsb)}</div><div style={s('font-size:9px;color:var(--text3);text-transform:uppercase')}>Form TSB</div></div>
        </div>
      </div>
    </>
  );
}

// ── this block · by discipline ────────────────────────────────────────────────
function DisciplineBreakdown({ disciplines }) {
  if (!disciplines?.length) return null;
  const maxH = Math.max(...disciplines.map((d) => d.hours), 0.001);
  return (
    <>
      <div style={s(eyebrow + ';margin:22px 2px 12px')}>This block · by discipline</div>
      <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:6px 16px')}>
        {disciplines.map((d, i) => {
          const distLabel = d.sport === 'Other' ? `${d.count} session${d.count === 1 ? '' : 's'}` : `${fmtKm(d.distanceKm)} km`;
          return (
            <div key={d.sport} style={s(`display:flex;align-items:center;gap:12px;padding:13px 0;${i < disciplines.length - 1 ? 'border-bottom:1px solid var(--line)' : ''}`)}>
              <div style={s('width:52px;font-size:12.5px;font-weight:600;color:var(--text)')}>{d.sport}</div>
              <div style={s('flex:1;height:6px;background:var(--bg4);border-radius:5px;overflow:hidden')}>
                <div style={s(`height:100%;width:${Math.round((d.hours / maxH) * 100)}%;border-radius:5px;background:${SPORT_COLOR[d.sport] || 'var(--accent)'}`)} />
              </div>
              <div className="mono" style={s('text-align:right;flex:none;min-width:78px')}>
                <span style={s('font-size:12.5px;font-weight:700')}>{distLabel}</span>
                <span style={s('font-size:11px;color:var(--text3)')}> · {d.hours.toFixed(d.hours >= 10 ? 0 : 1)}h</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
