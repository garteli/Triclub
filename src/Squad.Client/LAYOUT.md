# Layout & width rules (read before touching any screen)

Why "the page has horizontal scrolling / controls overlap" keeps coming back, and the
rules that prevent it. The current web build is clean — these rules keep it that way.

## The portal model

The whole app renders inside a single **`.phone`** element (see `theme.css`):

- `.phone` — `width:100%; max-width:480px; height:100dvh; overflow:hidden`. This is the app
  viewport. It **clips** its own content, so nothing inside it can scroll the page sideways.
- `.scr` (inside `.phone`) — `position:absolute; inset:0; overflow-y:auto; overflow-x:hidden`.
  The vertical scroller. **Horizontal overflow is clipped here**, never scrolled.
- `.appheader` (first child of `.scr`) — `position:sticky; top:0`. The global header.
- `.app-shell` / `html` / `body` — all set `overflow-x:hidden` (+ `max-width:100vw` on the
  shell) so a stray fixed/full-bleed child can never scroll the whole page sideways.

**Contract:** the page can never scroll horizontally. If content is too wide it gets clipped,
not scrolled — so an overflow shows up as *clipped/cut-off content*, which is easy to catch.

## The three things that actually cause width bugs

### 1. Native inputs (`<input type=date>` etc.) — and "keyboard breaks the width"
iOS gives native controls a **large intrinsic min-width**. If a control grows past its box,
then when it's focused iOS scrolls the page **sideways** to reveal the overflow — this is what
"the width breaks when the keyboard opens" is. A `flex:1` column also defaults to
`min-width:auto` (won't shrink below its content), so a date input in a side-by-side row
overflows into its neighbour ("control/date overlap").

**This is now handled globally** in `theme.css` — every control inside `.phone` gets
`box-sizing:border-box; min-width:0; max-width:100%`, and `type=date`/`type=number` get
`appearance:none`. So a new raw `<input>` can't overflow its container by default. You only
need to add per-element care for **side-by-side** inputs: give the flex **column** `min-width:0`
(e.g. `EditProfile`, `PlanEditor`). The shared `<Field>` (`wizard.jsx`) and `SettingsUI.jsx`
inputs also set these inline.

### 2. Flex rows without `min-width:0`
Any `display:flex` row whose children hold shrinkable content (ellipsised text, inputs, a
progress bar) needs `min-width:0` on the shrinkable children, or they refuse to shrink and
push past the edge. Pair with `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`
on text that must truncate.

### 3. Full-bleed horizontal strips
Tab strips / rails use the full-bleed pattern:
```
className="hscroll"  style="margin:0 -18px; padding:0 18px; overflow-x:auto"
```
`.hscroll` scrolls **internally** (its own `overflow-x:auto`) and hides its scrollbar. Content
past the edge here is intended (you swipe it). Never remove the `overflow-x:auto`.

## Before shipping a screen

- No fixed pixel widths wider than ~360px on anything that isn't inside an `.hscroll`.
- Side-by-side inputs: `min-width:0` on the columns; hardened input style on the inputs.
- Quick check at 390px: `document.documentElement.scrollWidth === innerWidth`, and no element
  (outside `.hscroll`) has `getBoundingClientRect().right > innerWidth`.

## Important: the native iOS app ships a JS snapshot

The Capacitor app **bundles** the web build (`webDir: ../Squad.Web/wwwroot`). Web deploys to
Azure do **not** reach it. A width fix only appears on device after a fresh native build:

```
npm run build && npx cap sync ios && npx cap open ios   # then Archive → TestFlight
```

So a bug seen in the installed app may already be fixed on `main`/web — check the current web
build before chasing it. A screenshot whose UI strings still exist in the code is the useful
kind; strings that no longer exist mean the device is on an old bundle.
