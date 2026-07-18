import {
  members, statusColor, ringColor, feed, planWeek, workoutDefs, discIcon,
  leaderboardData, coachInsights, activitySplits, hrZones, laps as lapsData,
  powerCurve as powerCurveData, achievements, segmentRows, segEfforts, pbs,
} from '../data/squadData.js';
import { deriveRideRiders, formatTimer, gapMeters } from './derive.js';

// Builds everything the screens need for a given (state, tick). This is the
// React port of the prototype's renderVals() — same derivations, same numbers.
export function buildViewModel(state, t, opts = {}) {
  const { workoutKey, lbTab } = state;

  // ---- squad members (progress rings) ----
  const squad = members.map((m) => ({
    ...m,
    dash: `${Math.round((m.pct / 100) * 138.2)} 138.2`,
    pctLabel: m.pct + '%',
    statusColor: statusColor(m.status),
    ringColor: ringColor(m.status),
  }));
  const squadOnTrack = members.filter((m) => m.status !== 'behind').length;
  const squadTotal = members.length;

  // ---- live ride (time-driven) ----
  const rideRiders = deriveRideRiders(t);
  const you = rideRiders[0];
  const rideTimer = formatTimer(t);
  const gap = gapMeters(t);

  // ---- plan week ----
  const plan = planWeek.map((p) => {
    const badge =
      p.status === 'done' ? { t: 'Done', c: 'var(--good)', bg: 'color-mix(in srgb,var(--good) 16%,transparent)' }
        : p.status === 'today' ? { t: 'Today', c: 'var(--accent-ink)', bg: 'var(--accent)' }
        : p.status === 'rest' ? { t: 'Rest', c: 'var(--text3)', bg: 'var(--bg4)' }
        : { t: 'Planned', c: 'var(--text2)', bg: 'var(--bg4)' };
    return {
      ...p,
      badgeT: badge.t, badgeC: badge.c, badgeBg: badge.bg,
      iconHtml: discIcon(p.disc),
      rowBorder: p.status === 'today' ? 'color-mix(in srgb,var(--accent) 40%,transparent)' : 'var(--line)',
    };
  });

  // ---- workout detail sheet ----
  const wd = workoutDefs[workoutKey] || workoutDefs.bike;
  const wkDetail = {
    title: wd.title, meta: wd.meta, color: wd.color,
    stats: wd.stats.map((s) => ({ v: s[0], l: s[1] })),
    blocks: wd.blocks.map((b) => ({
      name: b[0], detail: b[1], tag: b[2], h: b[3] + 'px',
      barBg: 'color-mix(in srgb,' + wd.color + ' 45%,transparent)',
    })),
    note: wd.note,
  };

  // ---- month grid (35 cells) ----
  const monthCells = [];
  const discCycle = ['', 'bike', 'gym', 'run', 'swim', 'bike', 'run', 'gym', 'bike', '', 'run', 'bike', 'swim', 'gym', 'run'];
  for (let i = 0; i < 35; i++) {
    const dn = i - 2;
    const inMonth = dn >= 1 && dn <= 30;
    const disc = inMonth ? discCycle[dn % discCycle.length] : '';
    const dotColor = disc === 'bike' ? 'var(--bike)' : disc === 'swim' ? 'var(--swim)' : disc === 'run' ? 'var(--run)' : disc === 'gym' ? 'var(--gym)' : 'transparent';
    const today = dn === 13;
    const done = inMonth && dn < 13;
    const cellStyle = today ? 'background:var(--accent);color:var(--accent-ink)' : inMonth ? 'background:var(--bg2);border:1px solid var(--line)' : 'background:transparent';
    monthCells.push({ day: inMonth ? dn : '', inMonth, disc, dotColor, done, today, cellStyle, dayOpacity: inMonth ? '1' : '0', dotOpacity: done ? '1' : '.5' });
  }

  // ---- leaderboard ----
  const tab = lbTab;
  const valOf = (r) => (tab === 'load' ? r.load : tab === 'vol' ? r.vol : tab === 'streak' ? r.streak : tab === 'swim' ? r.swim : tab === 'bike' ? r.bike : r.run);
  const unitOf = tab === 'streak' ? 'd' : '';
  const sortKey = (r) => (tab === 'vol' ? parseFloat(r.vol) : valOf(r));
  const leaderboardSource = opts.leaderboardRows?.length ? opts.leaderboardRows : leaderboardData;
  const sorted = [...leaderboardSource].sort((a, b) => sortKey(b) - sortKey(a));
  const maxV = Math.max(...sorted.map(sortKey));
  const lbRows = sorted.map((r, i) => {
    const rank = i + 1;
    return {
      ...r, rank, val: valOf(r), unit: unitOf,
      barPct: Math.round((sortKey(r) / maxV) * 100),
      moveIcon: r.move > 0 ? '▲' : r.move < 0 ? '▼' : '—',
      moveColor: r.move > 0 ? 'var(--good)' : r.move < 0 ? 'var(--bad)' : 'var(--text3)',
      rankColor: r.you ? 'var(--accent)' : 'var(--text2)',
      barColor: r.you ? 'var(--accent)' : 'var(--text3)',
      rowStyle: r.you ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)' : 'background:var(--bg2);border:1px solid var(--line)',
      podSize: rank === 1 ? '62px' : '52px', podFont: rank === 1 ? '18px' : '15px',
      podBorder: rank === 1 ? 'var(--accent)' : 'var(--line2)',
      podBadgeBg: rank === 1 ? 'var(--accent)' : 'var(--bg4)', podBadgeColor: rank === 1 ? 'var(--accent-ink)' : 'var(--text)',
      pedestalH: rank === 1 ? '56px' : rank === 2 ? '40px' : '28px',
    };
  });
  const podium = [lbRows[1], lbRows[0], lbRows[2]].filter(Boolean);
  const lbTabDefs = [['load', 'Load'], ['vol', 'Volume'], ['streak', 'Streak'], ['swim', 'Swim'], ['bike', 'Bike'], ['run', 'Run']];
  const lbTabs = lbTabDefs.map(([id, labelText]) => ({
    id, label: labelText,
    style: 'flex:none;padding:8px 14px;border-radius:11px;font-size:12.5px;font-weight:600;white-space:nowrap;' +
      (tab === id ? 'background:var(--accent);color:var(--accent-ink)' : 'background:var(--bg2);border:1px solid var(--line);color:var(--text2)'),
  }));

  // ---- coach ----
  const coach = coachInsights.map((c) => ({
    ...c,
    sevStyle: 'font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:3px 7px;border-radius:6px;color:' + c.color + ';background:color-mix(in srgb,' + c.color + ' 15%,transparent)',
  }));

  // ---- profile ----
  const laps = lapsData.map((l) => ({ ...l, rowBg: l.best ? 'background:var(--accent-dim)' : 'background:transparent', bestColor: l.best ? 'var(--accent)' : 'var(--text)' }));
  const pcMax = Math.max(...powerCurveData.map((p) => p.w));
  const powerCurve = powerCurveData.map((p) => ({ ...p, h: Math.round((p.w / pcMax) * 72 + 8) }));
  const segRows = segmentRows.map((r) => ({
    ...r,
    rowStyle: r.you ? 'background:var(--accent-dim);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)' : 'background:var(--bg2);border:1px solid var(--line)',
    rankColor: r.crown ? 'var(--bike)' : r.you ? 'var(--accent)' : 'var(--text2)',
  }));
  const seMax = Math.max(...segEfforts), seMin = Math.min(...segEfforts);
  const segEffortBars = segEfforts.map((v, i) => ({ h: Math.round(((seMax - v) / (seMax - seMin + 0.01)) * 44 + 14), best: i === segEfforts.length - 1 }));
  const maxSplit = Math.max(...activitySplits), minSplit = Math.min(...activitySplits);
  const splitBars = activitySplits.map((sv, i) => {
    const fast = sv <= minSplit + 0.1;
    return { km: i + 1, pace: sv.toFixed(1), h: Math.round(((sv - minSplit) / (maxSplit - minSplit + 0.01)) * 60 + 18), fast, barColor: fast ? 'var(--accent)' : 'var(--bike)', op: fast ? '1' : '.55' };
  });

  return {
    squad, squadOnTrack, squadTotal,
    feed,
    rideRiders, you, rideTimer, gapMeters: gap, joinedCount: rideRiders.length,
    plan, wkDetail, monthCells,
    lbRows, podium, lbTabs,
    coach,
    pbs, hrZones, laps, powerCurve, achievements, segRows, segEffortBars, splitBars,
  };
}
