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

  const setPageLayout = useCallback((layout) => mut((c) => balanceHero({ ...c, layout })), [mut]);
  const setPageSide = useCallback((side) => mut((c) => ({ ...c, side })), [mut]);
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
    pages, pageIdx, editFields, picker, autoRotate, pagerVisible, dragFrom, family,
    actions: {
      goPage, nextPage, prevPage, toggleEdit, toggleAutoRotate,
      setPageLayout, setPageSide, setPageCount,
      pressStart, pressEnd, onDragStart, onDropAt, setHero,
      openPicker, closePicker, pickField, addPage, deletePage, pokePager,
    },
  };
}
