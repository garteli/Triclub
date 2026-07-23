// Native add-to-calendar via the OS calendar (EventKit on iOS, CalendarContract on Android), through
// the Capacitor calendar plugin. We open the system event editor pre-filled so the user reviews and
// saves — that needs only write access (no reading the user's calendar) and never fabricates a
// duration (the editor supplies its own default end the user can adjust).
//
// Loaded only on a native platform via a dynamic import from calendar.js, so the web bundle never
// pulls the plugin in (and the web SPA boot is unaffected).
import { CapacitorCalendar } from '@ebarooni/capacitor-calendar';

export async function addEventNative({ title, startMs, location, description }) {
  // iOS 17+ requires write access before the editor can be presented; harmless if already granted.
  try { await CapacitorCalendar.requestWriteOnlyCalendarAccess(); } catch { /* the editor may still prompt */ }
  await CapacitorCalendar.createEventWithPrompt({
    title,
    startDate: startMs,
    ...(location ? { location } : {}),
    ...(description ? { description } : {}),
  });
  return true; // the native editor was presented (the user may still cancel — that's their choice)
}
