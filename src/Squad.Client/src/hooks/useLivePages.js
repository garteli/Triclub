import { useCallback, useEffect, useRef, useState } from 'react';

// Default Garmin Edge–style pages for the live ride. Each page:
//   { name, side:'none'|'group', layout:'grid'|'hero', heroIndex?, fields:[token] }
// Field tokens: a metric id ('spd'…), 'chart:spd|hr|power', or 'map'.
const DEFAULT_PAGES = [
  // Hero pages carry an odd field count so the hero (full-width) sits above complete
  // rows of two — no ragged half-empty last row. See balanceHero().
  { name: 'Overview', side: 'none', layout: 'hero', heroIndex: 0, fields: ['spd', 'time', 'dist', 'hr', 'pwr', 'cad', 'grad'] },
  { name: 'Climb', side: 'group', layout: 'grid', fields: ['grad', 'elev', 'spd', 'hr'] },
  { name: 'Group', side: 'group', layout: 'grid', fields: ['leader', 'packpos', 'gap', 'spd'] },
  // Peloton spread — a single full tile: 2D pack layout + "% time in lead" board.
  { name: 'Peloton', side: 'none', layout: 'grid', fields: ['peloton'] },
  { name: 'Gear', side: 'none', layout: 'grid', fields: ['gear', 'gearratio', 'di2', 'cad'] },
  { name: 'Charts', side: 'none', layout: 'grid', fields: ['chart:spd', 'chart:hr', 'chart:power'] },
  { name: 'Map', side: 'none', layout: 'grid', fields: ['map'] },
];

// Motorsport rides: no power/cadence/drivetrain — seed pages of speed / distance / time /
// elevation / group / map only. The rider can still edit these and add their own pages.
const DEFAULT_PAGES_MOTOR = [
  { name: 'Overview', side: 'none', layout: 'hero', heroIndex: 0, fields: ['spd', 'time', 'dist', 'avgspd', 'grad'] },
  { name: 'Ride', side: 'none', layout: 'grid', fields: ['spd', 'dist', 'time', 'maxspd', 'elev', 'grad'] },
  { name: 'Group', side: 'group', layout: 'grid', fields: ['leader', 'packpos', 'gap', 'spd'] },
  { name: 'Charts', side: 'none', layout: 'grid', fields: ['chart:spd', 'chart:hr'] },
  { name: 'Map', side: 'none', layout: 'grid', fields: ['map'] },
];

const defaultPagesFor = (family) => (family === 'motorsport' ? DEFAULT_PAGES_MOTOR : DEFAULT_PAGES);

// Persist each family's page layout + current page so a refresh / next ride resumes them.
const PKEY = 'squad.livepages.v1';
const famKey = (family) => (family === 'motorsport' ? 'motorsport' : 'endurance');
const loadState = (family) => {
  try { return (JSON.parse(localStorage.getItem(PKEY) || '{}')[famKey(family)]) || {}; } catch { return {}; }
};
const saveState = (family, st) => {
  try {
    const all = JSON.parse(localStorage.getItem(PKEY) || '{}');
    all[famKey(family)] = st;
    localStorage.setItem(PKEY, JSON.stringify(all));
  } catch { /* storage unavailable — non-fatal */ }
};

const COUNT_POOL = ['spd', 'hr', 'pwr', 'dist', 'time', 'cad', 'avgspd', 'grad'];

// Free-form layout: tiles are positioned + sized on an 8-col × 20-row grid (1-based).
export const FREE_COLS = 8;
export const FREE_ROWS = 20;
// Default placement for a new free tile: 4×3 blocks, two per row, flowing down.
const autoSlot = (i) => ({ x: (i % 2) * 4 + 1, y: Math.min(FREE_ROWS - 2, Math.floor(i / 2) * 3 + 1), w: 4, h: 3 });
// Do two grid rects overlap? (half-open cells)
const rectsOverlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// Is `rect` in-bounds and clear of every slot except `skip`?
const slotFree = (slots, rect, skip) =>
  rect.x >= 1 && rect.y >= 1 && rect.x + rect.w - 1 <= FREE_COLS && rect.y + rect.h - 1 <= FREE_ROWS &&
  !slots.some((s, i) => i !== skip && rectsOverlap(rect, s));
// First free WxH cell (row-major), or null if the grid has no room.
const findFreeSlot = (slots, w, h) => {
  for (let y = 1; y <= FREE_ROWS - h + 1; y++) for (let x = 1; x <= FREE_COLS - w + 1; x++) {
    if (slotFree(slots, { x, y, w, h }, -1)) return { x, y, w, h };
  }
  return null;
};

// Slots aligned 1:1 with fields, repaired/back-filled + clamped to the grid.
export function ensureSlots(page) {
  const n = page.fields.length;
  const src = Array.isArray(page.slots) ? page.slots : [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = autoSlot(i), sl = src[i] || {};
    const w = Math.max(1, Math.min(FREE_COLS, sl.w || a.w));
    const h = Math.max(1, Math.min(FREE_ROWS, sl.h || a.h));
    const x = Math.max(1, Math.min(FREE_COLS - w + 1, sl.x || a.x));
    const y = Math.max(1, Math.min(FREE_ROWS - h + 1, sl.y || a.y));
    out.push({ x, y, w, h });
  }
  return out;
}

// Monochrome display toggle — a global preference (not per-family), persisted on this device.
const MONO_KEY = 'squad.livepages.mono';
const loadMono = () => { try { return localStorage.getItem(MONO_KEY) === '1'; } catch { return false; } };

// A hero tile spans the full width, so the remaining tiles should complete rows of two.
// If they don't (even total), append a fresh metric so the grid never leaves a gap.
function balanceHero(c) {
  if (c.layout !== 'hero') return c;
  const f = c.fields.slice();
  while (f.length % 2 === 0) {
    f.push(COUNT_POOL.find((t) => !f.includes(t)) || COUNT_POOL[f.length % COUNT_POOL.length]);
  }
  return { ...c, fields: f };
}

// Owns the live-ride page state (pages, current page, edit/picker/pager/drag) plus
// the two timers the design calls for: 4s pager auto-hide and 500ms long-press to
// edit. Auto-rotate (7s) is driven off the shared tick `t` while the ride is active.
export function useLivePages(t, active, family) {
  const [pages, setPages] = useState(() => loadState(family).pages || defaultPagesFor(family));
  const [dataPage, setDataPage] = useState(() => loadState(family).page || 0);
  const [editFields, setEditFields] = useState(false);
  // Which family the current pages belong to — persist under it, and reload when it changes
  // (e.g. the active club finishes loading, or the athlete switches clubs).
  const curFamily = useRef(famKey(family));
  useEffect(() => {
    if (curFamily.current === famKey(family)) return;
    curFamily.current = famKey(family);
    const st = loadState(family);
    setPages(st.pages || defaultPagesFor(family));
    setDataPage(st.page || 0);
  }, [family]);
  // Persist layout + current page under the current family (keyed off the ref so a family
  // switch doesn't clobber the new family's slot with the old pages).
  useEffect(() => { saveState(curFamily.current === 'motorsport' ? 'motorsport' : 'endurance', { pages, page: dataPage }); }, [pages, dataPage]);
  const [picker, setPicker] = useState({ open: false, slot: 0 });
  const [autoRotate, setAutoRotate] = useState(false);
  const [mono, setMono] = useState(loadMono);
  useEffect(() => { try { localStorage.setItem(MONO_KEY, mono ? '1' : '0'); } catch { /* storage unavailable */ } }, [mono]);
  const [pagerVisible, setPagerVisible] = useState(true);
  const [dragFrom, setDragFrom] = useState(null);

  const pressTimer = useRef(null);
  const pagerTimer = useRef(null);
  const editRef = useRef(false);
  const lastAdv = useRef(-1);
  useEffect(() => { editRef.current = editFields; }, [editFields]);

  // Keep dataPage in range if pages shrink.
  const pageIdx = Math.min(dataPage, pages.length - 1);

  // Mutate the current page in place.
  const mut = useCallback((fn) => {
    setPages((ps) => { const p = ps.slice(); p[Math.min(dataPage, p.length - 1)] = fn({ ...p[Math.min(dataPage, p.length - 1)] }); return p; });
  }, [dataPage]);

  const closePicker = useCallback(() => setPicker({ open: false, slot: 0 }), []);

  // Show the pager and (re)start the 4s idle fade — suppressed while editing.
  const pokePager = useCallback(() => {
    setPagerVisible(true);
    clearTimeout(pagerTimer.current);
    pagerTimer.current = setTimeout(() => { if (!editRef.current) setPagerVisible(false); }, 4000);
  }, []);

  const goPage = useCallback((i) => { setDataPage(i); closePicker(); pokePager(); }, [closePicker, pokePager]);
  const nextPage = useCallback(() => { setDataPage((p) => (p + 1) % pages.length); closePicker(); pokePager(); }, [pages.length, closePicker, pokePager]);
  const prevPage = useCallback(() => { setDataPage((p) => (p - 1 + pages.length) % pages.length); closePicker(); pokePager(); }, [pages.length, closePicker, pokePager]);

  const toggleEdit = useCallback(() => { setEditFields((e) => !e); closePicker(); }, [closePicker]);
  const toggleAutoRotate = useCallback(() => setAutoRotate((a) => !a), []);
  const setMonoOn = useCallback((v) => setMono(!!v), []);

  const setPageLayout = useCallback((layout) => mut((c) => {
    if (layout === 'free') return { ...c, layout, slots: ensureSlots(c) };
    return balanceHero({ ...c, layout });
  }), [mut]);
  const setPageSide = useCallback((side) => mut((c) => ({ ...c, side })), [mut]);
  // Free-layout tile geometry — move (x,y) and resize (w,h) on the 8×20 grid. Both reject a change
  // that would overlap another tile (so the tile stops at the edge of its neighbours).
  const moveSlot = useCallback((i, x, y) => mut((c) => {
    const slots = ensureSlots(c).slice(); if (!slots[i]) return c;
    const rect = { ...slots[i], x, y };
    if (!slotFree(slots, rect, i)) return c;
    slots[i] = rect; return { ...c, slots };
  }), [mut]);
  const resizeSlot = useCallback((i, w, h) => mut((c) => {
    const slots = ensureSlots(c).slice(); if (!slots[i]) return c;
    const rect = { ...slots[i], w, h };
    if (!slotFree(slots, rect, i)) return c;
    slots[i] = rect; return { ...c, slots };
  }), [mut]);
  const addField = useCallback(() => mut((c) => {
    const tok = COUNT_POOL.find((t) => !c.fields.includes(t)) || COUNT_POOL[c.fields.length % COUNT_POOL.length];
    const slots = ensureSlots(c);
    const spot = findFreeSlot(slots, 4, 3) || findFreeSlot(slots, 3, 2) || findFreeSlot(slots, 2, 2) || { x: 1, y: 1, w: 2, h: 2 };
    return { ...c, fields: [...c.fields, tok], slots: [...slots, spot] };
  }), [mut]);
  const removeField = useCallback((i) => mut((c) => {
    if (c.fields.length <= 1) return c;
    return { ...c, fields: c.fields.filter((_, k) => k !== i), slots: ensureSlots(c).filter((_, k) => k !== i) };
  }), [mut]);
  const setPageCount = useCallback((n) => mut((c) => {
    const f = c.fields.slice(0, n); let k = 0;
    while (f.length < n) f.push(COUNT_POOL[k++ % COUNT_POOL.length]);
    return balanceHero({ ...c, fields: f });
  }), [mut]);

  // Long-press (500ms) anywhere on a field → edit mode.
  const pressStart = useCallback(() => {
    clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setEditFields(true), 500);
  }, []);
  const pressEnd = useCallback(() => clearTimeout(pressTimer.current), []);

  const onDragStart = useCallback((i) => setDragFrom(i), []);
  const onDropAt = useCallback((i) => {
    setDragFrom((from) => {
      if (from != null && from !== i) {
        mut((c) => {
          const f = c.fields.slice();
          const [x] = f.splice(from, 1);
          f.splice(i, 0, x);
          let hi = c.heroIndex == null ? 0 : c.heroIndex;
          if (from === hi) hi = i;
          else { if (from < hi) hi--; if (i <= hi) hi++; }
          return { ...c, fields: f, heroIndex: hi };
        });
      }
      return null;
    });
  }, [mut]);

  const setHero = useCallback((i) => mut((c) => balanceHero({ ...c, heroIndex: i, layout: 'hero' })), [mut]);

  const openPicker = useCallback((slot) => setPicker({ open: true, slot }), []);
  const pickField = useCallback((tok) => {
    setPages((ps) => {
      const p = ps.slice();
      const c = { ...p[Math.min(dataPage, p.length - 1)] };
      const f = c.fields.slice();
      f[picker.slot] = tok;
      c.fields = f;
      p[Math.min(dataPage, p.length - 1)] = c;
      return p;
    });
    closePicker();
  }, [dataPage, picker.slot, closePicker]);

  const addPage = useCallback(() => {
    setPages((ps) => [...ps, { name: 'Custom', side: 'none', layout: 'grid', fields: ['spd', 'hr', 'pwr', 'dist'] }]);
    setDataPage((_) => pages.length); // land on the new page
  }, [pages.length]);
  const deletePage = useCallback(() => {
    setPages((ps) => (ps.length <= 1 ? ps : ps.filter((_, i) => i !== Math.min(dataPage, ps.length - 1))));
    setDataPage((p) => Math.max(0, p - 1));
  }, [dataPage]);

  // Auto-rotate: advance one page every 7s while the ride is active.
  useEffect(() => {
    if (!active || !autoRotate) return;
    if (t > 0 && t % 7 === 0 && lastAdv.current !== t) {
      lastAdv.current = t;
      setDataPage((p) => (p + 1) % pages.length);
    }
  }, [t, active, autoRotate, pages.length]);

  // Reset the pager to visible + armed whenever the ride goes active.
  useEffect(() => { if (active) pokePager(); }, [active, pokePager]);
  useEffect(() => () => { clearTimeout(pressTimer.current); clearTimeout(pagerTimer.current); }, []);

  return {
    pages, pageIdx, editFields, picker, autoRotate, pagerVisible, dragFrom, family, mono,
    actions: {
      goPage, nextPage, prevPage, toggleEdit, toggleAutoRotate, setMono: setMonoOn,
      setPageLayout, setPageSide, setPageCount, moveSlot, resizeSlot, addField, removeField,
      pressStart, pressEnd, onDragStart, onDropAt, setHero,
      openPicker, closePicker, pickField, addPage, deletePage, pokePager,
    },
  };
}
