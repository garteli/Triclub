// Tiny alarm-beep helper for the fall-detection countdown. iOS only lets audio play if the
// AudioContext was created/resumed from a user gesture — so we unlock it when the rider ARMS fall
// detection (a tap), and reuse that same context for the beeps later when a fall is detected (no
// gesture of its own). Best-effort: every call is wrapped so a blocked/absent audio API is a no-op.

let ctx = null;

function ac() {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) ctx = new AC();
  } catch { ctx = null; }
  return ctx;
}

// Call from a user gesture (the arm toggle) to unlock audio for later automatic beeps.
export function unlockAlarm() {
  const c = ac();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    // A near-silent blip fully unlocks the context on iOS.
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g); g.connect(c.destination);
    o.start(); o.stop(c.currentTime + 0.03);
  } catch { /* ignore */ }
}

// One alarm beep. `urgent` (last few seconds) makes it higher + louder.
export function alarmBeep({ urgent = false } = {}) {
  const c = ac();
  if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const now = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'square';
    o.frequency.value = urgent ? 1245 : 880;
    const peak = urgent ? 0.55 : 0.32;
    const dur = urgent ? 0.28 : 0.16;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(g); g.connect(c.destination);
    o.start(now); o.stop(now + dur + 0.02);
  } catch { /* ignore */ }
}
