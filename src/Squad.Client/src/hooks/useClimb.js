import { useClimbs } from './useClimbs.js';
import { progressMeters, elevAt } from '../lib/elevation.js';
import { gradeColor } from '../lib/climbs.js';

// Resolves the ONE climb that matters right now on the followed course — the one you're on, else
// the nearest ahead within the approach window — and returns everything both the ClimbPro card and
// the individual "Climb" data fields need: the to-go numbers (distance / ascent / time / gradient),
// the category, and the gradient-shaded profile geometry with the rider's position. Null when
// there's no course, no fix, or no climb nearby. All derived from real terrain — never fabricated.

const APPROACH_M = 1000; // surface the climb this far before it begins
const LW = 400, LH = 104; // elevation-line viewBox (stretched to width; preserveAspectRatio none)
// Fallback climbing speed (kph) from gradient when there's no live speed yet.
const estKph = (grade) => Math.max(6, Math.min(24, 18 - (grade || 0) * 1.0));

export function useClimb(tel, { indoor = false } = {}) {
  const course = (tel?.course || []).filter((p) => p && p[0] != null && p[1] != null);
  const { profile, climbs } = useClimbs(indoor ? [] : course);

  // Where the rider is on the course.
  const riders = (tel?.riders || []).filter((r) => r.lat != null && r.lon != null);
  const youR = riders.find((r) => r.you);
  const path = (tel?.path || []).filter((p) => p && p[0] != null && p[1] != null);
  const you = youR ? [youR.lat, youR.lon] : (path.length ? path[path.length - 1] : null);
  const progress = progressMeters(course, you);

  if (indoor || !profile || !climbs.length || progress == null) return null;

  // The relevant climb: the one we're on, else the nearest ahead within the approach window.
  let climb = null, index = -1, phase = null, distToStart = 0;
  for (let i = 0; i < climbs.length; i++) {
    const c = climbs[i];
    if (progress >= c.startDist && progress < c.endDist) { climb = c; index = i; phase = 'climbing'; break; }
  }
  if (!climb) {
    for (let i = 0; i < climbs.length; i++) {
      const c = climbs[i];
      if (c.startDist > progress) {
        const d = c.startDist - progress;
        if (d <= APPROACH_M) { climb = c; index = i; phase = 'approach'; distToStart = d; }
        break;
      }
    }
  }
  if (!climb) return null;

  const prof = profile.profile;
  const currentE = elevAt(prof, progress);
  // Local gradient (%) over a 100 m window centred on the given distance.
  const gradeAt = (d) => {
    const a = elevAt(prof, Math.max(0, d - 50)), b = elevAt(prof, d + 50);
    return a != null && b != null ? (b - a) / 100 * 100 : 0; // Δe over 100 m = percent
  };

  // "To go" values: remaining to the top while climbing; the whole climb while approaching.
  const climbing = phase === 'climbing';
  const distToGoM = climbing ? Math.max(0, climb.endDist - progress) : climb.length;
  const ascentToGoM = climbing ? Math.max(0, (climb.topE ?? 0) - (currentE ?? 0)) : climb.gain;
  const remGrade = distToGoM > 0 ? (ascentToGoM / distToGoM) * 100 : climb.avgGrade;
  const liveKph = Number.isFinite(tel?.spd) && tel.spd > 3 ? tel.spd : null;
  const etaSec = (distToGoM / 1000) / (liveKph || estKph(remGrade)) * 3600;
  const gradeNow = climbing ? gradeAt(progress) : climb.avgGrade;

  // Profile slice (exact endpoints) → gradient bars (height ∝ steepness, colour by band) + an
  // elevation line, plus the rider's position — the geometry the ClimbPro card renders.
  const inner = prof.filter((p) => p.dist > climb.startDist && p.dist < climb.endDist);
  const cp = [{ dist: climb.startDist, e: elevAt(prof, climb.startDist) }, ...inner, { dist: climb.endDist, e: elevAt(prof, climb.endDist) }];
  const eMin = Math.min(...cp.map((p) => p.e)), eMax = Math.max(...cp.map((p) => p.e));
  const span = Math.max(1, eMax - eMin);
  const yOf = (e) => LH - 4 - ((e - eMin) / span) * (LH - 24); // elevation → line y (viewBox units)
  const bars = [];
  for (let i = 1; i < cp.length; i++) {
    const dl = cp[i].dist - cp[i - 1].dist;
    const g = dl > 0 ? ((cp[i].e - cp[i - 1].e) / dl) * 100 : 0;
    const steep = Math.max(0, Math.min(1, g / 15)); // 15% → full-height bar
    bars.push({ h: (18 + steep * 80).toFixed(1), color: gradeColor(Math.max(0, g)) });
  }
  const linePath = cp.map((p, i) => `${i ? 'L' : 'M'}${(6 + (i / Math.max(1, cp.length - 1)) * (LW - 12)).toFixed(1)} ${yOf(p.e).toFixed(1)}`).join(' ');
  const posFrac = climbing ? Math.max(0, Math.min(1, (progress - climb.startDist) / Math.max(1, climb.length))) : null;
  const posTopPct = climbing ? (yOf(elevAt(prof, Math.min(climb.endDist, Math.max(climb.startDist, progress)))) / LH) * 100 : null;

  return {
    id: climb.startDist,        // stable id (for the card's dismiss)
    index, total: climbs.length, phase, climbing,
    distToStartM: distToStart,  // approach only
    distToGoM, ascentToGoM, etaSec, gradeNow,
    category: climb.category, topE: climb.topE, avgGrade: climb.avgGrade,
    bars, linePath, posFrac, posTopPct,
  };
}
