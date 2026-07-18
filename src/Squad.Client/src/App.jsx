import { useMemo, useState } from 'react';
import { useTick } from './hooks/useTick.js';
import { useSimulatedRide } from './hooks/useSimulatedRide.js';
// import { useLiveRide } from './hooks/useLiveRide.js'; // swap in for real telemetry
import { buildViewModel } from './lib/viewModel.js';
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

// Initial prototype state (matches the handoff's Component.state).
const initialState = {
  screen: 'dash', theme: 'dark', lang: 'en', accent: 'orange',
  dashVar: 'a', rideVar: 'a', rideState: 'lobby',
  planView: 'week', lbTab: 'load', showWorkout: false, workoutKey: 'bike', coachView: false,
};

const screens = {
  dash: Dashboard, ride: LiveRide, plan: Plan, lb: Leaderboard,
  feed: Feed, seg: Segments, coach: Coach, profile: Profile,
};

export default function App() {
  const [state, setState] = useState(initialState);
  const t = useTick();
  const vm = useMemo(() => buildViewModel(state, t), [state, t]);

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
  }), []);

  // Live ride feed. Simulated so the coordinate map animates without a native
  // recorder; swap for: useLiveRide(rideId, { getToken, meId }) to go real.
  const live = useSimulatedRide();

  const Screen = screens[state.screen] || Dashboard;
  const dir = state.lang === 'he' ? 'rtl' : 'ltr';

  return (
    <div className="app-shell">
      <ControlDock state={state} actions={actions} />
      <Phone theme={state.theme} accent={state.accent} lang={state.lang} dir={dir} screen={state.screen} go={actions.go}>
        <Screen vm={vm} state={state} actions={actions} live={live} />
      </Phone>
    </div>
  );
}
