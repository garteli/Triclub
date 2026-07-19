import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTick } from './hooks/useTick.js';
import { useSimulatedRide } from './hooks/useSimulatedRide.js';
import { useLivePages } from './hooks/useLivePages.js';
import { useSquadFeed } from './hooks/useSquadFeed.js';
import { useLeaderboard } from './hooks/useLeaderboard.js';
import { useActivities } from './hooks/useActivities.js';
import { useSquads } from './hooks/useSquads.js';
import { usePlan } from './hooks/usePlan.js';
import { createSquad, joinSquad } from './lib/squads.js';
// import { useLiveRide } from './hooks/useLiveRide.js'; // swap in for real telemetry
import { buildViewModel } from './lib/viewModel.js';
import { loadSession, saveSession, clearSession, enrollBiometric, fetchMe, getProfile } from './lib/auth.js';
import ControlDock from './components/ControlDock.jsx';
import Phone from './components/Phone.jsx';
import Dashboard from './screens/Dashboard.jsx';
import LiveRide from './screens/LiveRide.jsx';
import Plan from './screens/Plan.jsx';
import Leaderboard from './screens/Leaderboard.jsx';
import Feed from './screens/Feed.jsx';
import Segments from './screens/Segments.jsx';
import Coach from './screens/Coach.jsx';
import Profile from './screens/Profile.jsx';
import Discover from './screens/Discover.jsx';
import GroupProfile from './screens/GroupProfile.jsx';
import Checkout from './screens/Checkout.jsx';
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

// Initial prototype state (matches the handoff's Component.state).
const initialState = {
  screen: 'dash', theme: 'dark', lang: 'en', accent: 'orange',
  dashVar: 'a', rideVar: 'a', rideState: 'lobby',
  planView: 'week', lbTab: 'load', showWorkout: false, workoutKey: 'bike', coachView: false,
  // discover / group / join-request / chat flow
  selGroup: 'galilee', selApplicant: null, payPlan: null, joinState: {}, reqStatus: {},
  // profiles
  selMember: 'noa', me: {}, following: {},
  // activities
  selActivity: 'a1',
};

const screens = {
  dash: Dashboard, ride: LiveRide, plan: Plan, lb: Leaderboard,
  feed: Feed, seg: Segments, coach: Coach, profile: Profile,
  discover: Discover, group: GroupProfile, pay: Checkout, requests: JoinRequests, chat: Messages,
  settings: Settings, welcome: Welcome, register: Register, login: Login, newgroup: CreateGroup,
  athlete: AthleteProfile, editprofile: EditProfile, notifs: Notifications, activities: Activities,
  upload: UploadActivity,
};

export default function App() {
  // Restore a persisted session ("stay signed in") so returning athletes land in
  // the app; otherwise start on the logged-out Welcome screen.
  const [state, setState] = useState(() => {
    const session = loadSession();
    return { ...initialState, session, screen: session ? 'dash' : 'welcome' };
  });
  const t = useTick();

  // ---- live backend data (feed + leaderboard) ----
  const session = state.session;
  const authed = !!session?.token;
  const squadId = session?.squadId;
  const getToken = useCallback(() => session?.token ?? null, [session]);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const { feed: liveFeed, status: feedStatus } = useSquadFeed({
    getToken,
    enabled: authed,
    onLeaderboardChanged: () => setRefreshSignal((n) => n + 1),
  });
  const { rows: liveLeaderboard } = useLeaderboard(authed ? squadId : null, { getToken, refreshSignal });
  const { items: liveActivities } = useActivities({ getToken, enabled: authed, refreshSignal });
  const { items: liveSquads } = useSquads({ getToken, enabled: authed, refreshSignal });
  const { plan: livePlan, summary: livePlanSummary } = usePlan({ getToken, enabled: authed });

  // The signed-in athlete's persisted profile (drives vm.me + Edit profile).
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    if (!authed) { setProfile(null); return; }
    let cancelled = false;
    getProfile(session.token).then((p) => { if (!cancelled) setProfile(p); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token, refreshSignal]);

  const vm = useMemo(
    () => buildViewModel(state, t, {
      feedItems: liveFeed, leaderboardRows: liveLeaderboard, activityItems: liveActivities,
      profile, squads: liveSquads, plan: livePlan, planSummary: livePlanSummary,
      // The athlete's active squad name (for the dashboard header).
      squadName: authed ? liveSquads.find((sq) => sq.id === squadId)?.name : undefined,
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
  }), [session?.token, refreshSession]);

  const patch = (p) => setState((s) => ({ ...s, ...p }));

  const actions = useMemo(() => ({
    // navigation: landing on the ride tab always returns to its lobby
    go: (id) => setState((s) => ({ ...s, screen: id, rideState: id === 'ride' ? 'lobby' : s.rideState })),
    // dock toggles
    setTheme: (theme) => patch({ theme }),
    setLang: (lang) => patch({ lang }),
    setAccent: (accent) => patch({ accent }),
    setDashVar: (dashVar) => patch({ dashVar }),
    setRideVar: (rideVar) => patch({ rideVar }),
    // ride
    startRide: () => patch({ rideState: 'active' }),
    backToLobby: () => patch({ rideState: 'lobby' }),
    // plan
    setPlanView: (planView) => patch({ planView }),
    toggleCoach: () => setState((s) => ({ ...s, coachView: !s.coachView })),
    openWorkout: (workoutKey) => patch({ showWorkout: true, workoutKey }),
    closeWorkout: () => patch({ showWorkout: false }),
    // leaderboard
    setLbTab: (lbTab) => patch({ lbTab }),
    // discover / groups
    openGroup: (id) => patch({ selGroup: id, screen: 'group' }),
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

  // Live ride feed. Simulated so the coordinate map animates without a native
  // recorder; swap for: useLiveRide(rideId, { getToken, meId }) to go real.
  const live = useSimulatedRide();

  // Garmin Edge–style live-ride pages (configurable fields, auto-rotate, edit).
  const rideActive = state.screen === 'ride' && state.rideState === 'active';
  const livePages = useLivePages(t, rideActive);

  const Screen = screens[state.screen] || Dashboard;
  const dir = state.lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="app-shell">
      {/* Dev-only prototype harness (screen switcher / theme toggles); never shipped. */}
      {import.meta.env.DEV && <ControlDock state={state} actions={actions} />}
      <Phone theme={state.theme} accent={state.accent} lang={state.lang} dir={dir} screen={state.screen} go={actions.go}>
        <Screen vm={vm} state={state} actions={actions} live={live} tick={t} livePages={livePages}
          getToken={getToken} onDataChanged={() => setRefreshSignal((n) => n + 1)}
          profile={profile} onProfileSaved={setProfile}
          onJoinSquad={authed ? squadOps.onJoinSquad : undefined}
          onCreateSquad={authed ? squadOps.onCreateSquad : undefined}
          meId={session?.athleteId} />
      </Phone>
    </div>
  );
}
