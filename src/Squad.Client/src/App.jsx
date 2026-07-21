import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTick } from './hooks/useTick.js';
import { useLiveRide } from './hooks/useLiveRide.js';
import { useSensors } from './hooks/useSensors.js';
import { useRideRecorder } from './hooks/useRideRecorder.js';
import { usePeerRanging } from './hooks/usePeerRanging.js';
import { useRideTelemetry } from './hooks/useRideTelemetry.js';
import { useLivePages } from './hooks/useLivePages.js';
import { useSquadFeed } from './hooks/useSquadFeed.js';
import { useLeaderboard } from './hooks/useLeaderboard.js';
import { useActivities } from './hooks/useActivities.js';
import { useSquads } from './hooks/useSquads.js';
import { usePlan } from './hooks/usePlan.js';
import { useGarminSync } from './hooks/useGarminSync.js';
import { useHealthSync } from './hooks/useHealthSync.js';
import { createSquad, joinSquad, activateSquad } from './lib/squads.js';
import { recordPayment, markPaymentPaid, waivePayment } from './lib/payments.js';
import { publishPlan, listPlans, getPlan, savePlan, deletePlan, importPlanPdf, getImportStatus } from './lib/plan.js';
// import { useLiveRide } from './hooks/useLiveRide.js'; // swap in for real telemetry
import { buildViewModel } from './lib/viewModel.js';
import { loadSession, saveSession, clearSession, enrollBiometric, fetchMe, getProfile } from './lib/auth.js';
import { loadPrefs, savePrefs } from './lib/prefs.js';
import { loadNav, saveNav } from './lib/navState.js';
import { loadDraft, draftMode } from './lib/rideDraft.js';
import { uploadAvatar, deleteAvatar } from './lib/avatar.js';
import { fetchAuthedObjectUrl, bustAuthedImage } from './lib/authedImage.js';
import { useNotifications } from './hooks/useNotifications.js';
import ControlDock from './components/ControlDock.jsx';
import Phone from './components/Phone.jsx';
import BootSplash from './components/BootSplash.jsx';
import AppHeader from './components/AppHeader.jsx';
import SyncToast from './components/SyncToast.jsx';
import Dashboard from './screens/Dashboard.jsx';
import LiveRide from './screens/LiveRide.jsx';
import Plan from './screens/Plan.jsx';
import PlanEditor from './screens/PlanEditor.jsx';
import PlansList from './screens/PlansList.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import Feed from './screens/Feed.jsx';
import Segments from './screens/Segments.jsx';
import Coach from './screens/Coach.jsx';
import Profile from './screens/Profile.jsx';
import Discover from './screens/Discover.jsx';
import GroupProfile from './screens/GroupProfile.jsx';
import ManageGroup from './screens/ManageGroup.jsx';
import Checkout from './screens/Checkout.jsx';
import RidePayment from './screens/RidePayment.jsx';
import CoachLedger from './screens/CoachLedger.jsx';
import JoinRequests from './screens/JoinRequests.jsx';
import Messages from './screens/Messages.jsx';
import Settings from './screens/Settings.jsx';
import Welcome from './screens/Welcome.jsx';
import Register from './screens/Register.jsx';
import Login from './screens/Login.jsx';
import CreateGroup from './screens/CreateGroup.jsx';
import AthleteProfile from './screens/AthleteProfile.jsx';
import EditProfile from './screens/EditProfile.jsx';
import Notifications from './screens/Notifications.jsx';
import Activities from './screens/Activities.jsx';
import UploadActivity from './screens/UploadActivity.jsx';
import Sensors from './screens/Sensors.jsx';
import Units from './screens/Units.jsx';
import TrainingZones from './screens/TrainingZones.jsx';
import NotificationPrefs from './screens/NotificationPrefs.jsx';
import Privacy from './screens/Privacy.jsx';
import Help from './screens/Help.jsx';
import Legal from './screens/Legal.jsx';

// Initial prototype state (matches the handoff's Component.state).
const initialState = {
  screen: 'dash', theme: 'dark', lang: 'en', accent: 'orange',
  dashVar: 'a', rideVar: 'a', rideState: 'lobby',
  planView: 'week', planWeekOffset: 0, planMonthOffset: 0, lbTab: 'load', showWorkout: false, workoutKey: 'bike', coachView: false,
  // discover / group / join-request / chat flow
  selGroup: 'galilee', selApplicant: null, payPlan: null, joinState: {}, reqStatus: {},
  // profiles
  selMember: 'noa', me: {}, following: {},
  // activities
  selActivity: 'a1',
};

const screens = {
  dash: Dashboard, ride: LiveRide, plan: Plan, plans: PlansList, planeditor: PlanEditor, lb: Leaderboard,
  feed: Feed, seg: Segments, coach: Coach, profile: Profile,
  discover: Discover, group: GroupProfile, manage: ManageGroup, pay: Checkout, recordpay: RidePayment, ledger: CoachLedger, requests: JoinRequests, chat: Messages,
  settings: Settings, welcome: Welcome, register: Register, login: Login, newgroup: CreateGroup,
  athlete: AthleteProfile, editprofile: EditProfile, notifs: Notifications, activities: Activities,
  upload: UploadActivity, sensors: Sensors,
  units: Units, zones: TrainingZones, notifprefs: NotificationPrefs, privacy: Privacy, help: Help, legal: Legal,
};

// Screens that render the persistent global header (AppHeader) via the Phone shell.
// `root: true` → club branding, no Back (the bottom-nav tabs); otherwise the header shows a
// Back button + `title`. A screen is only listed here once its own in-page header has been
// removed, so the two never double up. (Migrated screen-by-screen.)
const HEADER_META = {
  dash: { root: true },
  lb: { root: true },
  coach: { root: true },
  notifs: { title: 'Notifications' },
  // Settings family (share components/SettingsUI Header, now title-less).
  units: { title: 'Units' },
  zones: { title: 'Training zones' },
  notifprefs: { title: 'Notifications' },
  privacy: { title: 'Privacy' },
  help: { title: 'Help & feedback' },
  legal: { title: 'Terms & privacy' },
  // Profile cluster.
  profile: { title: 'Profile' },
  settings: { title: 'Settings' },
  editprofile: { title: 'Edit profile' },
  // Content pages.
  activities: { title: 'Activities' },
  discover: { title: 'Discover' },
  seg: { title: 'Segments' },
  plans: { title: 'Training plans' },
  sensors: { title: 'Connected sensors' },
  upload: { title: 'Upload' },
  // Coach/group management.
  manage: { title: 'Manage group' },
  ledger: { title: 'Ride payments' },
  // Tab root + contextual screens (dynamic titles from the view model).
  plan: { root: true },
  athlete: { title: (vm) => vm.athlete?.name || 'Athlete' },
  group: { title: (vm) => vm.selGroupData?.name || 'Group' },
  recordpay: { title: 'Record a payment' },
  chat: { title: 'Squad chat' },
  feed: { title: 'Activity' },
  pay: { title: 'Checkout' },
  requests: { title: 'Join requests' },
  planeditor: { title: 'Plan editor' },
  // The full-screen active ride is intentionally NOT here — it's a chrome-free immersive page.
};

export default function App() {
  // Restore a persisted session ("stay signed in") so returning athletes land in
  // the app; otherwise start on the logged-out Welcome screen.
  const [state, setState] = useState(() => {
    const session = loadSession();
    // Hydrate device-scoped preferences (units / notifications / privacy). The
    // profile photo now lives in blob storage — it's fetched from the API once the
    // session is confirmed (see the avatar effect below), not restored from disk.
    const base = { ...initialState, ...loadPrefs(), avatar: null, session };
    if (!session) return { ...base, screen: 'welcome' };

    // Always open on the dashboard — unless a live ride is in progress, in which case return
    // to it. We keep the last selections (group/activity/member) so those screens still open
    // to the right thing, but we no longer restore the last arbitrary screen on launch.
    const nav = loadNav();
    const rideLive = nav?.rideState === 'active';
    const merged = {
      ...base,
      screen: rideLive ? 'ride' : 'dash',
      rideState: rideLive ? 'active' : 'lobby',
      selGroup: nav?.selGroup ?? base.selGroup,
      selActivity: nav?.selActivity ?? base.selActivity,
      selMember: nav?.selMember ?? base.selMember,
    };

    // A recording that was mid-flight (resume) or finished-but-unsaved (recover) when the app
    // closed also counts as a live activity: land on the ride screen so the recovered buffers /
    // save card surface (the recorder hook restores them — see useRideRecorder + lib/rideDraft.js).
    const how = draftMode(loadDraft());
    if (how === 'recover') { merged.screen = 'ride'; merged.rideState = 'lobby'; }
    else if (how === 'resume') { merged.screen = 'ride'; merged.rideState = 'active'; }
    return merged;
  });
  const t = useTick();

  // Launch splash: hold it for at least 2s from page open (window.__bootAt, set in index.html),
  // then fade out. Seamlessly continues the static #boot-splash that showed while React loaded.
  const [booting, setBooting] = useState(true);
  const [splashHiding, setSplashHiding] = useState(false);
  useEffect(() => {
    const bootAt = window.__bootAt || Date.now();
    const remaining = Math.max(0, 2000 - (Date.now() - bootAt));
    const hideAt = setTimeout(() => setSplashHiding(true), remaining);
    const doneAt = setTimeout(() => setBooting(false), remaining + 340); // after the .32s fade
    return () => { clearTimeout(hideAt); clearTimeout(doneAt); };
  }, []);

  // ---- live backend data (feed + leaderboard) ----
  const session = state.session;
  const authed = !!session?.token;
  const squadId = session?.squadId;
  const getToken = useCallback(() => session?.token ?? null, [session]);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Garmin Connect: on the native build, once a session is persisted on the device, pull
  // any new activities on launch (and right after connecting). No-op on web / when signed
  // out. New activities land in the same ingest pipeline as .fit uploads, so the feed,
  // leaderboard and Activities list refresh via the shared data-refresh signal.
  const garminSync = useGarminSync({
    getToken,
    onDataChanged: () => setRefreshSignal((n) => n + 1),
    syncOnLaunch: authed,
  });
  // Apple Health (native only) — wellness + activities import. `available` is false on web.
  const healthSync = useHealthSync({ getToken, onDataChanged: () => setRefreshSignal((n) => n + 1) });

  // Latest session for the (deps-[]) actions closure — so setAvatar can read the
  // current token without rebuilding the whole actions object.
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; });
  const myAvatarUrl = session?.athleteId ? `/api/images/avatars/${String(session.athleteId).toLowerCase()}` : null;

  // Navigation trail for the global header's Back button. We record each distinct screen
  // so back() can pop to wherever the athlete came from, rather than every screen hard-coding
  // a back target. Capped so it can't grow unbounded.
  const historyRef = useRef([]);
  useEffect(() => {
    const h = historyRef.current;
    if (h[h.length - 1] !== state.screen) h.push(state.screen);
    if (h.length > 40) h.shift();
  }, [state.screen]);

  const { feed: liveFeed, status: feedStatus } = useSquadFeed({
    getToken,
    enabled: authed,
    refreshSignal,
    onLeaderboardChanged: () => setRefreshSignal((n) => n + 1),
  });
  const { rows: liveLeaderboard } = useLeaderboard(authed ? squadId : null, { getToken, refreshSignal });
  const { items: liveActivities } = useActivities({ getToken, enabled: authed, refreshSignal });
  const { items: liveSquads } = useSquads({ getToken, enabled: authed, refreshSignal });
  // Monday (local) of the week the plan screen is viewing — current week shifted by the
  // week date-nav offset — sent to the backend so week navigation fetches real data.
  const planWeekStart = useMemo(() => {
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(),
      now.getDate() - ((now.getDay() + 6) % 7) + state.planWeekOffset * 7);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  }, [state.planWeekOffset]);
  const { plan: livePlan, summary: livePlanSummary } = usePlan({ getToken, enabled: authed, weekStart: planWeekStart });

  // The signed-in athlete's persisted profile (drives vm.me + Edit profile).
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!authed) { setProfile(null); return; }
    let cancelled = false;
    getProfile(session.token).then((p) => { if (!cancelled) setProfile(p); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, refreshSignal]);

  // The signed-in athlete's own avatar, fetched from blob storage (via the authed
  // image proxy) once the session is present. Null (→ initials) when they have none.
  useEffect(() => {
    if (!authed || !myAvatarUrl) { setState((s) => (s.avatar ? { ...s, avatar: null } : s)); return; }
    let cancelled = false;
    fetchAuthedObjectUrl(myAvatarUrl, session.token)
      .then((url) => { if (!cancelled && url) setState((s) => ({ ...s, avatar: url })); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, myAvatarUrl, session?.token]);

  const vm = useMemo(
    () => buildViewModel(state, t, {
      feedItems: liveFeed, leaderboardRows: liveLeaderboard, activityItems: liveActivities,
      profile, squads: liveSquads, plan: livePlan, planSummary: livePlanSummary, avatar: state.avatar,
      // The athlete's active squad (name + logo/banner for the dashboard header).
      squadName: authed ? liveSquads.find((sq) => sq.id === squadId)?.name : undefined,
      activeSquad: authed ? liveSquads.find((sq) => sq.id === squadId) : null,
      activeClubId: authed ? squadId : null,
    }),
    [state, t, liveFeed, liveLeaderboard, liveActivities, profile, liveSquads, livePlan, livePlanSummary, authed, squadId],
  );

  // After joining/creating a squad the athlete's active SquadId changes server-side;
  // refresh the session so the feed/leaderboard/activities follow to the new squad.
  const refreshSession = useCallback(async () => {
    if (!session?.token) return;
    try {
      const me = await fetchMe(session.token);
      if (me) setState((s) => ({ ...s, session: { ...s.session, ...me } }));
    } catch { /* ignore */ }
  }, [session?.token]);

  const squadOps = useMemo(() => ({
    onJoinSquad: async (id) => {
      await joinSquad(session.token, id);
      await refreshSession();
      setRefreshSignal((n) => n + 1);
    },
    onCreateSquad: async (body) => {
      const created = await createSquad(session.token, body);
      await refreshSession();
      setRefreshSignal((n) => n + 1);
      return created;
    },
    // Switch the active club: persist server-side, then refresh the session so squadId
    // (and everything keyed off it — header, feed, leaderboard, activities) follows.
    onSwitchSquad: async (id) => {
      if (id === session.squadId) return;
      await activateSquad(session.token, id);
      await refreshSession();
      setRefreshSignal((n) => n + 1);
    },
  }), [session?.token, session?.squadId, refreshSession]);

  // Ride-payment ledger ops (need the bearer; rebuilt on token change). Passed down as
  // a `payments` prop, like squadOps — the app only tracks status, money moves off-app.
  const paymentOps = useMemo(() => ({
    onRecordPayment: async (body) => {
      const created = await recordPayment(session.token, body);
      setRefreshSignal((n) => n + 1);
      return created;
    },
    onMarkPaid: async (id, method, note) => {
      const updated = await markPaymentPaid(session.token, id, method, note);
      setRefreshSignal((n) => n + 1);
      return updated;
    },
    onWaivePayment: async (id, note) => {
      const updated = await waivePayment(session.token, id, note);
      setRefreshSignal((n) => n + 1);
      return updated;
    },
  }), [session?.token]);

  // Coach plan publishing — writes each assigned athlete's PlannedWorkout rows.
  // Rebuilt on token change; passed down as onPublishPlan (like squadOps/paymentOps).
  const onPublishPlan = useCallback(async (body) => {
    const result = await publishPlan(session?.token, body);
    setRefreshSignal((n) => n + 1); // refresh the plan surface for the coach's own view
    return result;
  }, [session?.token]);

  // Coach's saved plans (CRUD). `selectedPlan` is the one loaded into the editor
  // (null = a new, blank plan). open/create set it and navigate to the editor.
  const [selectedPlan, setSelectedPlan] = useState(null);
  const planOps = useMemo(() => ({
    list: () => listPlans(session?.token),
    open: async (id) => {
      const p = await getPlan(session?.token, id);
      setSelectedPlan(p);
      setState((s) => ({ ...s, screen: 'planeditor' }));
    },
    create: () => { setSelectedPlan(null); setState((s) => ({ ...s, screen: 'planeditor' })); },
    save: (body) => savePlan(session?.token, body),
    remove: (id) => deletePlan(session?.token, id),
    // Import a PDF → AI builds a plan in the background; submit returns a jobId the modal polls.
    importPdf: (file, opts) => importPlanPdf(session?.token, file, opts),
    importStatus: (jobId) => getImportStatus(session?.token, jobId),
  }), [session?.token]);

  // Pull-to-refresh: re-pull every live surface (feed snapshot, leaderboard,
  // activities, squads, profile) by bumping the shared signal, and hold the
  // spinner briefly so the gesture reads as doing work even on a fast network.
  const onRefresh = useCallback(async () => {
    setRefreshSignal((n) => n + 1);
    await new Promise((resolve) => setTimeout(resolve, 650));
  }, []);

  // Header sync: pull from every connected source (Garmin + Apple Health — native only) and
  // refresh the feed/leaderboard/activities. On web the source syncs are unavailable, so only
  // the refresh runs. `syncActive` drives the SyncToast for the whole combined operation.
  const [syncActive, setSyncActive] = useState(false);
  const onSync = useCallback(async () => {
    if (syncActive) return;
    setSyncActive(true);
    try {
      const jobs = [];
      if (garminSync.available && garminSync.connected) jobs.push(garminSync.run({ force: true }));
      if (healthSync.available) jobs.push(healthSync.run());
      jobs.push(onRefresh());
      await Promise.all(jobs);
    } finally {
      setSyncActive(false);
    }
  }, [syncActive, garminSync, healthSync, onRefresh]);

  const patch = (p) => setState((s) => ({ ...s, ...p }));

  const actions = useMemo(() => ({
    // navigation: landing on the ride tab always returns to its lobby
    go: (id) => setState((s) => ({ ...s, screen: id, rideState: id === 'ride' ? 'lobby' : s.rideState })),
    // Global Back: handle in-screen "back" first (an open applicant detail closes to the
    // list), then pop the nav trail to the previous distinct screen (dashboard if empty).
    // Leaving checkout also clears the pending pay plan (its old back was a cancel).
    back: () => setState((s) => {
      if (s.screen === 'requests' && s.selApplicant) return { ...s, selApplicant: null };
      const h = historyRef.current;
      if (h[h.length - 1] === s.screen) h.pop(); // drop current
      const prev = h[h.length - 1] || 'dash';
      const next = { ...s, screen: prev, rideState: prev === 'ride' ? 'lobby' : s.rideState };
      if (s.screen === 'pay') next.payPlan = null;
      return next;
    }),
    // appearance / language — persisted to localStorage via savePrefs (survive reload)
    setTheme: (theme) => setState((s) => savePrefs({ ...s, theme })),
    setLang: (lang) => setState((s) => savePrefs({ ...s, lang })),
    setAccent: (accent) => setState((s) => savePrefs({ ...s, accent })),
    // settings preferences (persisted to localStorage via savePrefs)
    setUnits: (units) => setState((s) => savePrefs({ ...s, units })),
    setTemp: (temp) => setState((s) => savePrefs({ ...s, temp })),
    setNotif: (key, value) => setState((s) => savePrefs({ ...s, notif: { ...s.notif, [key]: value } })),
    setPrivacy: (key, value) => setState((s) => savePrefs({ ...s, privacy: { ...s.privacy, [key]: value } })),
    // profile photo — optimistic local update, then persist to blob storage. The
    // cropped JPEG data URL renders immediately; the upload syncs it across devices
    // and busts any cached teammate-view of this avatar so it refreshes. Returns a
    // promise so callers (EditProfile) can surface an upload failure.
    setAvatar: async (dataUrl) => {
      setState((s) => ({ ...s, avatar: dataUrl || null }));
      const sess = sessionRef.current;
      const token = sess?.token ?? null;
      const url = sess?.athleteId ? `/api/images/avatars/${String(sess.athleteId).toLowerCase()}` : null;
      if (dataUrl) await uploadAvatar(token, dataUrl); else await deleteAvatar(token);
      if (url) bustAuthedImage(url);
    },
    openLink: (url) => { try { window.open(url, '_blank', 'noopener'); } catch { /* ignore */ } },
    copyDiagnostics: () => { try { navigator.clipboard?.writeText('Domestique Team 1.0.0 (build 100)'); } catch { /* ignore */ } },
    exportData: () => { try { window.open('https://domestique.team/account/export', '_blank', 'noopener'); } catch { /* ignore */ } },
    deleteAccount: () => { try { window.open('https://domestique.team/account/delete', '_blank', 'noopener'); } catch { /* ignore */ } },
    setDashVar: (dashVar) => patch({ dashVar }),
    setRideVar: (rideVar) => patch({ rideVar }),
    // ride
    startRide: () => patch({ rideState: 'active' }),
    backToLobby: () => patch({ rideState: 'lobby' }),
    // plan
    setPlanView: (planView) => patch({ planView }),
    // Date navigation: step the active view (week or month) forward/back, or jump to today.
    planStep: (dir) => setState((s) => (s.planView === 'week'
      ? { ...s, planWeekOffset: s.planWeekOffset + dir }
      : { ...s, planMonthOffset: s.planMonthOffset + dir })),
    planToday: () => patch({ planWeekOffset: 0, planMonthOffset: 0 }),
    toggleCoach: () => setState((s) => ({ ...s, coachView: !s.coachView })),
    openWorkout: (workoutKey) => patch({ showWorkout: true, workoutKey }),
    closeWorkout: () => patch({ showWorkout: false }),
    // leaderboard
    setLbTab: (lbTab) => patch({ lbTab }),
    // discover / groups
    openGroup: (id) => patch({ selGroup: id, screen: 'group' }),
    // ride-payment nav — selGroup is already the viewed squad
    openRecordPay: () => patch({ screen: 'recordpay' }),
    openLedger: () => patch({ screen: 'ledger' }),
    openManage: () => patch({ screen: 'manage' }),
    applyJoin: () => setState((s) => ({ ...s, joinState: { ...s.joinState, [s.selGroup]: 'applied' } })),
    simulateApprove: () => setState((s) => ({ ...s, joinState: { ...s.joinState, [s.selGroup]: 'approved' } })),
    freeJoin: () => setState((s) => ({ ...s, joinState: { ...s.joinState, [s.selGroup]: 'paid' } })),
    payMember: () => setState((s) => (s.joinState[s.selGroup] === 'approved' ? { ...s, payPlan: 'member', screen: 'pay' } : s)),
    payDropin: () => setState((s) => (s.joinState[s.selGroup] === 'approved' ? { ...s, payPlan: 'dropin', screen: 'pay' } : s)),
    payCoach: () => setState((s) => (s.joinState[s.selGroup] === 'approved' ? { ...s, payPlan: 'coach', screen: 'pay' } : s)),
    confirmPay: () => setState((s) => ({ ...s, joinState: { ...s.joinState, [s.selGroup]: 'paid' }, screen: 'group', payPlan: null })),
    cancelPay: () => patch({ screen: 'group', payPlan: null }),
    // join requests (coach)
    openApplicant: (id) => patch({ selApplicant: id, screen: 'requests' }),
    closeApplicant: () => patch({ selApplicant: null }),
    approve: () => setState((s) => ({ ...s, reqStatus: { ...s.reqStatus, [s.selApplicant]: 'approved' } })),
    decline: () => setState((s) => ({ ...s, reqStatus: { ...s.reqStatus, [s.selApplicant]: 'declined' } })),
    // activities
    openActivity: (id) => setState((s) => ({ ...s, selActivity: id, screen: 'feed', activityBack: s.screen === 'feed' ? s.activityBack : s.screen })),
    // profiles
    openAthlete: (id) => setState((s) => ({ ...s, selMember: id, screen: 'athlete', profileBack: s.screen === 'athlete' ? s.profileBack : s.screen })),
    setMe: (p) => setState((s) => ({ ...s, me: { ...s.me, ...p } })),
    toggleFollow: (id) => setState((s) => ({ ...s, following: { ...s.following, [id]: !s.following[id] } })),
    // auth
    signIn: (session, { remember = true } = {}) => {
      saveSession(session, { remember });
      setState((s) => ({ ...s, session, screen: 'dash' }));
    },
    // persist a session without navigating (the wizard shows its own success step)
    establishSession: (session, { remember = true } = {}) => {
      saveSession(session, { remember });
      setState((s) => ({ ...s, session }));
    },
    signOut: () => {
      clearSession();
      setState((s) => ({ ...s, session: null, screen: 'welcome' }));
    },
    enrollBiometric: (session) => enrollBiometric(session),
  }), []);

  // On boot with a persisted session, verify the JWT server-side; sign out if the
  // server rejects it (expired/revoked) so we don't render a dead session.
  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    fetchMe(session.token)
      .then((me) => {
        // Refresh any profile fields that may have changed server-side.
        if (!cancelled && me) setState((s) => ({ ...s, session: { ...s.session, ...me } }));
      })
      .catch(() => { if (!cancelled) actions.signOut(); });
    return () => { cancelled = true; };
    // Run once per token change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  // Real live ride. Hub riders (SignalR) + this device's own GPS recorder + BLE
  // sensors. There is no simulation: fields show real values or "—"/"waiting" until a
  // ride is active with a fix/sensors, or teammates are streaming. The squad shares
  // one ride channel (rideId = squadId).
  const onRide = state.screen === 'ride';
  const rideActive = onRide && state.rideState === 'active';
  const sensors = useSensors();
  const liveRide = useLiveRide(squadId, { getToken, meId: session?.athleteId, enabled: onRide && !!squadId });
  const recorder = useRideRecorder({ pushTelemetry: liveRide.pushTelemetry, sensors, getToken, onSaved: () => setRefreshSignal((n) => n + 1), enabled: authed });
  // Phone-to-phone BLE ranging (native only): advertise this athlete + scan teammates for
  // pack position while a ride is active. Inert on web — no-op that leaves GPS+heading in charge.
  const peerRanging = usePeerRanging({ athleteId: session?.athleteId, active: rideActive, pushPeerRange: liveRide.pushPeerRange });
  const tel = useRideTelemetry({ t, active: rideActive, riders: liveRide.riders, recorder, sensors });

  // Garmin Edge–style live-ride pages (configurable fields, auto-rotate, edit).
  const livePages = useLivePages(t, rideActive);

  const live = { riders: liveRide.riders, status: liveRide.status, pushTelemetry: liveRide.pushTelemetry, recorder, sensors, tel, livePages, peerRanging };

  // Unread count for the global header's bell badge.
  const { items: notifItems } = useNotifications({ getToken, enabled: authed });
  const notifUnread = notifItems.filter((n) => n.unread).length;

  // Remember the last screen + selections so a refresh returns here (see lib/navState.js).
  // Only while signed in — a logged-out location isn't worth restoring.
  useEffect(() => {
    if (state.session) saveNav(state);
  }, [state.session, state.screen, state.rideState, state.selGroup, state.selActivity, state.selMember]);

  // A recovered ride (recorder restored a finished/stale draft as a pending save card on
  // boot) must be shown on the ride lobby, where the save/discard card lives.
  useEffect(() => {
    if (recorder.pending) {
      setState((s) => (s.screen === 'ride' && s.rideState === 'lobby' ? s : { ...s, screen: 'ride', rideState: 'lobby' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.pending]);

  const Screen = screens[state.screen] || Dashboard;
  const dir = state.lang === 'he' ? 'rtl' : 'ltr';

  // Persistent global header for migrated screens (never on the full-screen active ride).
  // HEADER_META only lists post-login screens, and logged-out users are always on the
  // chromeless welcome/login flow, so no auth gate is needed here.
  const headerMeta = HEADER_META[state.screen];
  const headerTitle = typeof headerMeta?.title === 'function' ? headerMeta.title(vm, state) : headerMeta?.title;
  const appHeader = headerMeta && !(state.screen === 'ride' && rideActive)
    ? (
      <AppHeader vm={vm} actions={actions} getToken={getToken} notifUnread={notifUnread}
        title={headerTitle} showBack={!headerMeta.root} rtl={state.lang === 'he'} onSync={onSync}
        onSwitchSquad={authed ? squadOps.onSwitchSquad : undefined} />
    )
    : null;

  return (
    <div className="app-shell">
      {booting && <BootSplash hiding={splashHiding} />}
      {authed && <SyncToast garmin={garminSync} health={healthSync} active={syncActive} />}
      {/* Dev-only prototype harness (screen switcher / theme toggles); never shipped. */}
      {import.meta.env.DEV && <ControlDock state={state} actions={actions} />}
      <Phone theme={state.theme} accent={state.accent} lang={state.lang} dir={dir} screen={state.screen} go={actions.go}
        header={appHeader}
        onRefresh={authed ? onRefresh : undefined} recording={recorder.recording}>
        <Screen key={state.screen === 'planeditor' ? `pe-${selectedPlan?.id || 'new'}` : state.screen}
          vm={vm} state={state} actions={actions} live={live} tick={t} livePages={livePages}
          getToken={getToken} onDataChanged={() => setRefreshSignal((n) => n + 1)}
          profile={profile} onProfileSaved={setProfile}
          onJoinSquad={authed ? squadOps.onJoinSquad : undefined}
          onCreateSquad={authed ? squadOps.onCreateSquad : undefined}
          onSwitchSquad={authed ? squadOps.onSwitchSquad : undefined}
          payments={authed ? paymentOps : undefined}
          onPublishPlan={authed ? onPublishPlan : undefined}
          plans={authed ? planOps : undefined} plan={selectedPlan}
          meId={session?.athleteId} />
      </Phone>
    </div>
  );
}
