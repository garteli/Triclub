# Squad — Team Training Platform

A pixel-faithful React implementation of the **Squad** triathlon team-training app
(from the Claude Design handoff), served by an **ASP.NET Core** host.

All eight screens are built: Squad Dashboard, Live Group Ride, Plan / Calendar,
Leaderboard, Activity + Feed, Segments, AI Coach, and Profile — with dark/light
themes, four accent colors, full English↔Hebrew (RTL) support, dashboard and
live-ride variants, and a live 1-second telemetry loop on the group ride.

## Architecture

```
Squad.sln
└─ src/
   ├─ Squad.Web/        ASP.NET Core host (net8.0) — serves the compiled SPA
   │  ├─ Program.cs     static files + SPA fallback + /api/health
   │  └─ wwwroot/       ← Vite build output lands here (generated)
   └─ Squad.Client/     React + Vite source (the whole UI)
      └─ src/
         ├─ App.jsx            state, telemetry tick, screen router
         ├─ theme.css          design tokens (theme / accent / keyframes)
         ├─ components/        Phone frame, StatusBar, BottomNav, ControlDock, Icon
         ├─ screens/           the 8 screens
         ├─ data/squadData.js  all demo data (squad, plan, workouts, leaderboard…)
         ├─ hooks/useTick.js   1-second counter
         └─ lib/               style helper, telemetry derivations, view-model
```

The React app builds **directly into** `Squad.Web/wwwroot`
(`Squad.Client/vite.config.js` → `outDir: '../Squad.Web/wwwroot'`), so the .NET
host serves it with no copy step.

## Prerequisites

- [.NET SDK 8.0+](https://dotnet.microsoft.com/download)
- [Node.js 18+](https://nodejs.org) and npm

## Run it

**1. Build the client** (produces `Squad.Web/wwwroot`):

```bash
cd src/Squad.Client
npm install
npm run build
```

**2. Run the host:**

```bash
cd ../Squad.Web
dotnet run
```

Then open the URL `dotnet run` prints (e.g. `https://localhost:7186`).

## Develop the UI with hot reload

Run Vite's dev server for instant HMR while editing the React app:

```bash
cd src/Squad.Client
npm run dev        # http://localhost:5173
```

Rebuild (`npm run build`) when you want the .NET host to pick up changes.

## Notes

- **Preview harness.** The panel to the left of the phone (the "control dock")
  is the prototype's harness: switch theme, language/RTL, accent, any of the 8
  screens, and the Dashboard / Live-Ride variants. The in-phone bottom nav
  exposes Dashboard, Plan, Live, Ranks and Coach; Feed, Segments and Profile are
  reached from in-screen links and the dock.
- **Live telemetry.** The Live Group Ride derives each rider's speed / heart-rate
  / distance from a 1-second tick (`useTick`), and the map riders animate along
  the SVG route via SMIL — matching the original prototype.
- **Demo data.** `Squad.Client/src/data/squadData.js` holds all content inline so
  the UI renders identically to the handoff. `Program.cs` includes an
  `/api/health` endpoint as the seam where real API endpoints would go.
- **Fidelity technique.** Screens are ported from the design's exact inline
  styles via a small `s('css-string')` → React-style-object helper
  (`lib/style.js`), keeping every color, radius and spacing value 1:1 with the
  source.
