import {
  members, statusColor, ringColor, feed, planWeek, workoutDefs, discIcon,
  leaderboardData, coachInsights, activitySplits, hrZones, laps as lapsData,
  powerCurve as powerCurveData, achievements, segmentRows, segEfforts, pbs,
  nearbyGroups as nearbyGroupsData, applicants as applicantsData, chatThread as chatThreadData,
  athleteExtra, activities as activitiesData,
} from '../data/squadData.js';

// Compact "18m ago" / "3h ago" / "2d ago" from an ISO timestamp (server feed).
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SPORT_COLOR = { Bike: 'var(--bike)', Run: 'var(--run)', Swim: 'var(--swim)', Gym: 'var(--gym)' };
const SPORT_ICON = { Bike: '🚴', Run: '🏃', Swim: '🏊', Gym: '🏋️' };
import { activityAnalysis } from './activityAnalysis.js';
import { familyOf, familyMeta } from './disciplines.js';

// Builds everything the screens need for a given (state, tick). This is the
// React port of the prototype's renderVals() — same derivations, same numbers.
export function buildViewModel(state, t, opts = {}) {
  const { workoutKey, lbTab } = state;

  // ---- discipline family (drives terminology / metrics / identity / grouping) ----
  // The active club's discipline decides whether the app runs in its endurance or
  // motorsport world. No active club (logged-out prototype) → endurance default.
  const familyId = familyOf(opts.activeSquad?.disc);
  const fam = familyMeta(opts.activeSquad?.disc);

  // ---- squad members (progress rings) ----
  // Live: derive the roster from the weekly leaderboard (real members + this-week
  // training load → ring fill relative to the squad's top load). Else seed data.
  const squadSource = opts.leaderboardRows?.length
    ? (() => {
        const maxLoad = Math.max(1, ...opts.leaderboardRows.map((r) => r.load || 0));
        return opts.leaderboardRows.map((r) => {
          const pct = Math.min(100, Math.round(((r.load || 0) / maxLoad) * 100));
          return {
            id: r.athleteId, name: r.you ? 'You' : r.name, initials: r.initials, color: r.color,
            avatarUrl: r.avatarUrl ?? null,
            pct, status: pct >= 85 ? 'crushing' : pct >= 45 ? 'ontrack' : 'behind',
          };
        });
      })()
    : members;
  const squad = squadSource.map((m) => ({
    ...m,
    dash: `${Math.round((m.pct / 100) * 138.2)} 138.2`,
    pctLabel: m.pct + '%',
    statusColor: statusColor(m.status),
    ringColor: ringColor(m.status),
  }));
  const squadOnTrack = squadSource.filter((m) => m.status !== 'behind').length;
  const squadTotal = squadSource.length;


  // ---- plan week ---- (live plan from opts.plan overrides the seed)
  const planSource = opts.plan?.length ? opts.plan : planWeek;
  const plan = planSource.map((p) => {
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
    // The real session opened (state.workoutRow) may carry a coach-attached route to follow —
    // surfaced here so the sheet can show it and pre-select it when the athlete starts the ride.
    course: state.workoutRow?.coursePoints?.length
      ? { name: state.workoutRow.courseName || 'Course', points: state.workoutRow.coursePoints }
      : null,
  };

  // ---- date navigation offsets (week & month are stepped independently) ----
  const weekOffset = state.planWeekOffset || 0;
  const monthOffset = state.planMonthOffset || 0;

  // ---- month grid (viewed month = current month + offset; dots from the real plan) ----
  const mnow = new Date();
  const monthAnchor = new Date(mnow.getFullYear(), mnow.getMonth() + monthOffset, 1);
  const mYear = monthAnchor.getFullYear(), mMonth = monthAnchor.getMonth();
  const firstDow = (new Date(mYear, mMonth, 1).getDay() + 6) % 7; // Mon=0..Sun=6
  const daysInMonth = new Date(mYear, mMonth + 1, 0).getDate();
  const todayMs = new Date(mnow.getFullYear(), mnow.getMonth(), mnow.getDate()).getTime();
  // Map real planned workouts to their full date → discipline (empty when no plan). Keying
  // by full 'yyyy-MM-dd' keeps dots on their real days when navigating between months.
  const DISC_DOT = { bike: 'var(--bike)', swim: 'var(--swim)', run: 'var(--run)', gym: 'var(--gym)' };
  const isoOf = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const planByIso = {};
  planSource.forEach((p) => { if (p.iso) planByIso[p.iso] = p.disc; });
  const monthCells = [];
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const dn = i - firstDow + 1;
    const inMonth = dn >= 1 && dn <= daysInMonth;
    const disc = inMonth ? (planByIso[isoOf(mYear, mMonth, dn)] || '') : '';
    const dotColor = DISC_DOT[disc] || 'transparent';
    const cellMs = inMonth ? new Date(mYear, mMonth, dn).getTime() : 0;
    const today = inMonth && cellMs === todayMs;
    const done = inMonth && !!disc && cellMs < todayMs;
    const cellStyle = today ? 'background:var(--accent);color:var(--accent-ink)' : inMonth ? 'background:var(--bg2);border:1px solid var(--line)' : 'background:transparent';
    monthCells.push({ day: inMonth ? dn : '', inMonth, disc, dotColor, done, today, cellStyle, dayOpacity: inMonth ? '1' : '0', dotOpacity: done ? '1' : '.5' });
  }

  // ---- plan date-nav labels (header eyebrow + the prev/next range/month strip) ----
  const monthLabel = monthAnchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekMonday = new Date(mnow.getFullYear(), mnow.getMonth(), mnow.getDate() - ((mnow.getDay() + 6) % 7) + weekOffset * 7);
  const weekSunday = new Date(weekMonday.getFullYear(), weekMonday.getMonth(), weekMonday.getDate() + 6);
  const rangeFmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekLabel = `${rangeFmt(weekMonday)} – ${rangeFmt(weekSunday)}`;
  const weekEyebrow = weekOffset === 0 ? 'This week'
    : weekOffset === -1 ? 'Last week'
    : weekOffset === 1 ? 'Next week'
    : weekOffset < 0 ? `${-weekOffset} weeks ago`
    : `In ${weekOffset} weeks`;
  const planNav = {
    weekLabel, monthLabel, weekEyebrow,
    isCurrent: state.planView === 'week' ? weekOffset === 0 : monthOffset === 0,
  };

  // ---- leaderboard ----
  // Motorsport clubs have no swim/bike/run breakdown — only overall Load/Volume/Streak.
  const lbTabDefs = fam.splits
    ? [['load', 'Load'], ['vol', 'Volume'], ['streak', 'Streak'], ['swim', 'Swim'], ['bike', 'Bike'], ['run', 'Run']]
    : [['load', 'Load'], ['vol', 'Volume'], ['streak', 'Streak']];
  // Clamp a stale tab (e.g. 'bike' selected then switched to a motorsport club) to Load.
  const tab = lbTabDefs.some(([id]) => id === lbTab) ? lbTab : 'load';
  const valOf = (r) => (tab === 'load' ? r.load : tab === 'vol' ? r.vol : tab === 'streak' ? r.streak : tab === 'swim' ? r.swim : tab === 'bike' ? r.bike : r.run);
  const unitOf = tab === 'streak' ? 'd' : '';
  const sortKey = (r) => (tab === 'vol' ? parseFloat(r.vol) : valOf(r));
  const leaderboardSource = opts.leaderboardRows?.length ? opts.leaderboardRows : leaderboardData;
  const sorted = [...leaderboardSource].sort((a, b) => sortKey(b) - sortKey(a));
  const maxV = Math.max(...sorted.map(sortKey));
  const initialsToId = Object.fromEntries(members.map((m) => [m.initials, m.id]));
  const lbRows = sorted.map((r, i) => {
    const rank = i + 1;
    return {
      ...r, rank, id: r.athleteId ?? initialsToId[r.initials], val: valOf(r), unit: unitOf,
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

  // ---- discover / groups / join / pay / requests / chat ----
  const { selGroup = 'galilee', selApplicant = null, payPlan = null } = state;
  const joinState = state.joinState || {};
  const reqStatus = state.reqStatus || {};

  // Live squads (from the API) override the seed groups when present.
  const groupSource = opts.squads?.length ? opts.squads : nearbyGroupsData;
  const nearbyGroups = groupSource.map((g) => ({
    ...g,
    badgeStyle:
      g.kind === 'free' ? 'color:var(--good);background:color-mix(in srgb,var(--good) 15%,transparent)'
        : g.kind === 'coach' ? 'color:var(--gym);background:color-mix(in srgb,var(--gym) 15%,transparent)'
        : 'color:var(--accent);background:var(--accent-dim)',
  }));
  const selGroupData = nearbyGroups.find((x) => x.id === selGroup) || nearbyGroups[0];

  // The clubs this athlete belongs to, for the dashboard active-club switcher. Only
  // meaningful with live squads (each carries a `member` flag); `active` marks the one
  // currently driving the feed/leaderboard (Athlete.SquadId, passed as activeClubId).
  const myClubs = (opts.squads || [])
    .filter((c) => c.member)
    .map((c) => ({
      id: c.id, name: c.name, color: c.color, logoUrl: c.logoUrl || null,
      active: c.id === opts.activeClubId,
      // Owner of this club? Drives the header's "Manage group" shortcut.
      owned: !!opts.meId && !!c.owner && String(c.owner).toLowerCase() === String(opts.meId).toLowerCase(),
    }));

  const joinBtnLock = 'margin-top:5px;background:var(--bg4);color:var(--text3);font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px;opacity:.7';
  const g2 = selGroupData || {};
  const jState = joinState[selGroup];
  const open = jState === 'approved';
  const applyState = {
    free: g2.kind === 'free', member: g2.member,
    notApplied: !g2.member && !jState,
    applied: jState === 'applied',
    approvedPaid: jState === 'approved' && g2.kind !== 'free',
    approvedFree: jState === 'approved' && g2.kind === 'free',
    paid: jState === 'paid' || g2.member,
    joinBtnStyle: open ? 'margin-top:5px;background:var(--accent);color:var(--accent-ink);font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px' : joinBtnLock,
    bookBtnStyle: open ? 'margin-top:5px;background:var(--bg4);border:1px solid var(--line);color:var(--text);font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px' : joinBtnLock,
    coachBtnStyle: open ? 'margin-top:5px;background:color-mix(in srgb,var(--gym) 18%,transparent);color:var(--gym);font-size:11px;font-weight:700;padding:5px 12px;border-radius:8px' : joinBtnLock,
    tierLabel: open ? '' : '🔒',
  };
  const tierOpenNote = open ? 'Approved — choose how to pay' : 'Locked until your application is approved';
  const payTitle = payPlan === 'dropin' ? 'One-time group ride' : payPlan === 'coach' ? '1:1 Coaching' : 'Membership';
  const payPrice = payPlan === 'dropin' ? '₪35'
    : payPlan === 'coach' ? '₪450/mo'
    : (g2.price || '₪90') + (payPlan === 'coach' ? '' : (g2.per || '/mo'));

  const fitColor = (a) => (a.fitKind === 'good' ? 'var(--good)' : 'var(--warn)');
  const fitBg = (a) => (a.fitKind === 'good' ? 'color-mix(in srgb,var(--good) 15%,transparent)' : 'color-mix(in srgb,var(--warn) 15%,transparent)');
  const statusLabelOf = (stt) => (stt === 'approved' ? 'Approved' : stt === 'declined' ? 'Declined' : 'Pending');
  const applicantList = applicantsData.map((a) => {
    const stt = reqStatus[a.id] || 'pending';
    return {
      ...a, status: stt, decided: stt !== 'pending',
      fitColor: fitColor(a), fitBg: fitBg(a),
      statusLabel: statusLabelOf(stt),
      statusColor: stt === 'approved' ? 'var(--good)' : stt === 'declined' ? 'var(--bad)' : 'var(--text3)',
    };
  });
  const pendingCount = applicantsData.filter((a) => (reqStatus[a.id] || 'pending') === 'pending').length;
  const selApplicantData = (() => {
    if (!selApplicant) return null;
    const a = applicantsData.find((x) => x.id === selApplicant);
    if (!a) return null;
    const stt = reqStatus[a.id] || 'pending';
    return { ...a, status: stt, decided: stt !== 'pending', statusLabel: statusLabelOf(stt), fitColor: fitColor(a), fitBg: fitBg(a) };
  })();

  const chatThread = chatThreadData.map((m) => ({
    ...m,
    wrap: m.me ? 'align-self:flex-end;align-items:flex-end' : 'align-self:flex-start;align-items:flex-start',
    timeAlign: m.me ? 'text-align:right' : 'text-align:left',
    bubble: m.me
      ? 'background:var(--accent);color:var(--accent-ink);border-radius:15px 15px 4px 15px;padding:10px 13px;font-size:13px;line-height:1.4'
      : 'background:var(--bg2);border:1px solid var(--line);color:var(--text);border-radius:15px 15px 15px 4px;padding:10px 13px;font-size:13px;line-height:1.4',
  }));

  // ---- athlete profile (view a teammate, or your own public profile) ----
  const me = state.me || {};
  const selMember = state.selMember || 'noa';
  const following = state.following || {};
  const rankById = Object.fromEntries(lbRows.map((r) => [r.id, r.rank]));
  const lbById = Object.fromEntries(leaderboardSource.map((r) => [initialsToId[r.initials], r]));
  const actByAthlete = {};
  activitiesData.forEach((a) => { if (!actByAthlete[a.athleteId]) actByAthlete[a.athleteId] = a.id; });
  const feedRows = feed.map((f) => { const aid = initialsToId[f.initials]; return { ...f, athleteId: aid, activityId: actByAthlete[aid] }; });
  // Live feed injection: when App passes server feed items (ActivityFeedItem[]),
  // render those instead of the seed feed. Same downstream shape as feedRows.
  const liveFeedRows = opts.feedItems?.length
    ? opts.feedItems.map((f) => ({
        id: f.id,
        name: f.athleteName,
        initials: f.initials,
        color: f.avatarColor,
        action: f.action,
        metric: f.metric,
        time: timeAgo(f.startUtc),
        icon: f.icon,
        discColor: f.discColor,
        reacts: f.reacts ?? 0,
        kudos: f.kudos ?? 0,
        comments: f.comments ?? 0,
        iKudoed: !!f.iKudoed,
        athleteId: f.athleteId,
        // f.id is the activity's own Guid (ActivityFeedItem.Id) — same key the
        // activities list uses — so the card can deep-link into its detail page.
        activityId: f.id,
        avatarUrl: f.avatarUrl ?? null,
      }))
    : null;

  const danaExtra = athleteExtra.dana || {};
  // Real signed-in profile (opts.profile) wins; unedited client state (me) overlays;
  // the mock Dana defaults are only a fallback for the no-session prototype.
  const p = opts.profile;
  const meFull = p ? {
    name: me.name || p.name || '',
    club: me.club ?? p.club ?? '',
    ageGroup: me.ageGroup ?? p.ageGroup ?? '',
    sport: me.sport || p.primarySport || 'Triathlon',
    level: me.level || p.level || 'Intermediate',
    ftp: me.ftp ?? p.ftp ?? '',
    weekly: me.weekly ?? p.weeklyHours ?? '',
    bio: me.bio ?? p.bio ?? '',
    birthDate: me.birthDate ?? p.birthDate ?? '',
    gender: me.gender ?? p.gender ?? '',
    weight: me.weight ?? p.weightKg ?? '',
    initials: p.initials || '', color: p.avatarColor, photo: opts.avatar || null,
  } : {
    name: me.name || '', club: me.club || danaExtra.club || '', ageGroup: me.ageGroup || danaExtra.ageGroup || '',
    sport: me.sport || danaExtra.sport || 'Triathlon', level: me.level || danaExtra.level || '',
    ftp: me.ftp ?? danaExtra.ftp ?? '', weekly: me.weekly || danaExtra.weekly || '', bio: me.bio || danaExtra.bio || '', initials: me.initials || '',
    birthDate: me.birthDate || '', gender: me.gender || '', weight: me.weight ?? '',
    photo: opts.avatar || null,
  };
  const athlete = (() => {
    const m = members.find((x) => x.id === selMember) || members[0];
    if (!m) return null;
    const extra = athleteExtra[m.id] || {};
    const lb = lbById[m.id] || {};
    const isMe = m.id === 'dana';
    const pick = (meVal, exVal) => (isMe ? (meVal ?? exVal) : exVal);
    const loads = [
      { key: 'swim', label: 'Swim', color: 'var(--swim)', v: lb.swim || 0 },
      { key: 'bike', label: 'Bike', color: 'var(--bike)', v: lb.bike || 0 },
      { key: 'run', label: 'Run', color: 'var(--run)', v: lb.run || 0 },
    ];
    return {
      id: m.id, isMe, following: !!following[m.id],
      name: isMe ? meFull.name : m.name, initials: m.initials, color: m.color, photo: isMe ? (opts.avatar || null) : null,
      club: pick(me.club, extra.club), ageGroup: pick(me.ageGroup, extra.ageGroup),
      sport: pick(me.sport, extra.sport), level: pick(me.level, extra.level),
      ftp: pick(me.ftp, extra.ftp), weekly: pick(me.weekly, extra.weekly), bio: pick(me.bio, extra.bio),
      pct: m.pct, streak: lb.streak ?? 0, rank: rankById[m.id], statusColor: statusColor(m.status),
      loads, recent: feedRows.filter((f) => f.name === m.name),
    };
  })();

  // ---- activities (Strava-style list + selected-activity detail) ----
  const memberById = Object.fromEntries(members.map((m) => [m.id, m]));
  const enrichAct = (a) => {
    const m = memberById[a.athleteId] || {};
    // Live rows carry their own athlete display fields + isMe flag; seed rows fall
    // back to the mock member lookup (and the legacy 'dana' == me convention).
    const isMe = a.isMe ?? (a.athleteId === 'dana');
    return {
      ...a,
      athleteName: isMe ? 'You' : (a.athleteName ?? m.name), isMe,
      initials: a.initials ?? m.initials, color: a.color ?? m.color,
      sportColor: SPORT_COLOR[a.sport] || 'var(--accent)', icon: SPORT_ICON[a.sport] || '🏅',
      reactText: a.kudos > 0
        ? `${a.kudos} ${a.kudos === 1 ? 'kudos' : 'kudos'} given`
        : 'Be the first to give kudos',
      hasMap: a.sport === 'Bike' || a.sport === 'Run',
      // The feed + detail maps draw the real ingested GPS track (GET .../track), so no
      // synthetic route is generated here.
      hasSplits: a.sport === 'Bike' || a.sport === 'Run',
      hasPower: a.sport === 'Bike', hasLaps: a.sport === 'Bike',
      hasSegment: a.sport === 'Bike' || a.sport === 'Run',
    };
  };
  // Live activity list injected by App (mapped server rows) overrides the seed data.
  const activitySource = opts.activityItems?.length ? opts.activityItems : activitiesData;
  const activities = activitySource.map(enrichAct);
  const myActivities = activities.filter((a) => a.isMe);
  const selActivity = state.selActivity || 'a1';
  const activityDetail = (() => {
    const a = activities.find((x) => x.id === selActivity) || activities[0];
    if (!a) return null;
    const metricCards = [
      [a.dist, a.distU, 'Distance', null],
      [a.moving, '', 'Moving', null],
      [String(a.load), '', 'Load', 'var(--accent)'],
      [a.avgSpeed, a.speedU, 'Avg speed', null],
      [a.elev, 'm', 'Elev gain', null],
      [String(a.avgHr), '', 'Avg HR', 'var(--run)'],
    ];
    return { ...a, metricCards, analysis: activityAnalysis(a) };
  })();

  const now = new Date();
  const todayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const todayLabelHe = ['יום א׳', 'יום ב׳', 'יום ג׳', 'יום ד׳', 'יום ה׳', 'יום ו׳', 'שבת'][now.getDay()];

  return {
    squad, squadOnTrack, squadTotal,
    todayLabel, todayLabelHe,
    // Active club's discipline family — screens read this to swap terminology,
    // which metrics they show, and their visual identity.
    family: familyId, fam,
    squadName: opts.squadName || null,
    // Active squad branding (proxy paths, null until the owner uploads) — surfaced
    // on the dashboard header so the club's identity carries across the app.
    squadLogo: opts.activeSquad?.logoUrl || null,
    squadBanner: opts.activeSquad?.bannerUrl || null,
    activeSquad: opts.activeSquad || null,
    myClubs, activeClubId: opts.activeClubId ?? null,
    feed: liveFeedRows ?? feedRows,
    activities, myActivities, activityDetail,
    athlete, me: meFull,
    nearbyGroups, selGroupData, applyState, tierOpenNote, payTitle, payPrice,
    applicantList, pendingCount, selApplicant: selApplicantData,
    noApplicantOpen: !selApplicant, applicantOpen: !!selApplicant,
    applicantPending: !!selApplicant && (reqStatus[selApplicant] || 'pending') === 'pending',
    chatThread,
    plan, wkDetail, monthCells, planNav,
    planSummary: opts.planSummary
      ? {
          planned: `${Math.floor(opts.planSummary.plannedMin / 60)}:${String(opts.planSummary.plannedMin % 60).padStart(2, '0')}`,
          load: String(opts.planSummary.load),
          done: opts.planSummary.done,
          total: opts.planSummary.total,
        }
      : null,
    lbRows, podium, lbTabs,
    coach,
    pbs, hrZones, laps, powerCurve, achievements, segRows, segEffortBars, splitBars,
  };
}
