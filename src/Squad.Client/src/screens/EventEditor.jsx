import { useEffect, useMemo, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import AuthedImage from '../components/AuthedImage.jsx';
import ImageEditor from '../components/ImageEditor.jsx';
import { listCourses, createCourse, deleteCourse, importCourseFromUrl, getCourse } from '../lib/courses.js';
import CoursePicker from '../components/CoursePicker.jsx';
import RouteMapGL from '../components/RouteMapGL.jsx';
import SportIcon from '../components/SportIcon.jsx';
import { BASEMAP_LABEL, nextBasemap, inIsrael, resolveBasemap, defaultBasemap } from '../lib/basemaps.js';
import { getRouteStyle } from '../lib/routeStyle.js';
import { getMapView, setMapStyle as persistMapStyle } from '../lib/mapView.js';
import { createSquadEvent, updateSquadEvent, uploadEventImage, deleteEventImage, toOffsetIso, toLocalInput } from '../lib/events.js';
import { dataUrlToBlob, loadImageFile } from '../lib/avatar.js';
import { bustAuthedImage } from '../lib/authedImage.js';

// Add / edit a group session (event). Reached from the Events tab: coach taps "Add event"
// (new) or a row's Edit (state.selEvent set). On save it POSTs (create) or PUTs (edit) and
// returns to the Events list. New events can be published now or saved as a draft; editing
// keeps the event's current publish state.

// The sport choices offered when scheduling, keyed by the club's discipline family — matches
// the inline scheduler in SquadEvents.jsx so both entry points show the same, club-appropriate
// options. Values are the ActivitySport byte stored on the event (0..3); motorsport clubs
// schedule a single "Ride" (stored as the generic bike=2, rendered with the motorcycle glyph).
const SPORT_OPTIONS = {
  endurance: [{ v: 1, label: 'Swim', glyph: 'swim' }, { v: 2, label: 'Bike', glyph: 'bike' }, { v: 3, label: 'Run', glyph: 'run' }],
  motorsport: [{ v: 2, label: 'Ride', glyph: 'moto' }],
};

// datetime-local default: the next round hour ("yyyy-MM-ddTHH:mm" in local time).
const defaultWhen = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000); d.setMinutes(0, 0, 0);
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const inputStyle = 'background:var(--bg3);border:1px solid var(--line);border-radius:11px;padding:11px 12px;font-size:13px;color:var(--text);outline:none;font-family:inherit;width:100%';
// Glass chrome for map overlay controls (matches the event page + full map).
const glass = 'background:rgba(20,23,29,.82);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.14);color:#fff';

export default function EventEditor({ vm, state, actions, getToken, onDataChanged }) {
  const squadId = vm.activeClubId;
  const editing = state?.selEvent || null;
  const isEdit = !!editing;

  // Sport choices adapt to the active club's discipline family (endurance vs motorsport),
  // so a motorsport club only offers "Ride" and an endurance club offers Swim/Bike/Run.
  const sportOptions = SPORT_OPTIONS[vm.family] || SPORT_OPTIONS.endurance;

  const [title, setTitle] = useState(editing?.title || '');
  // Keep an existing event's sport if it's valid for this family; otherwise fall back to the
  // first option (e.g. a motorsport club opening a legacy run event lands on "Ride").
  const [sport, setSport] = useState(() => {
    const cur = editing?.sport ?? 2;
    return sportOptions.some((o) => o.v === cur) ? cur : sportOptions[0].v;
  });
  const [when, setWhen] = useState(() => (editing ? toLocalInput(editing.start) : defaultWhen()));
  const [courseId, setCourseId] = useState(editing?.courseId ? String(editing.courseId) : '');
  const [notes, setNotes] = useState(editing?.notes || '');

  const [courses, setCourses] = useState(null); // null = loading
  const [picker, setPicker] = useState(false);  // route picker sheet open
  const [busy, setBusy] = useState('');         // '', 'publish', 'draft', 'save'
  const [error, setError] = useState('');

  // Selected route's geometry, previewed on a map right in the editor (with a tap-to-expand
  // fullscreen). Fetched whenever the picked course changes; the coach owns the course so
  // getCourse resolves. rstyle = the app-wide route colour/width; mapStyle = shared basemap layer.
  const [routePts, setRoutePts] = useState(null); // [[lat,lon],…] | null
  const [mapFull, setMapFull] = useState(false);  // fullscreen route map overlay
  const [mapStyle, setMapStyle] = useState(() => resolveBasemap(getMapView().style));
  const rstyle = useMemo(() => getRouteStyle(), []);

  useEffect(() => {
    let ok = true;
    (async () => {
      try { const t = await getToken?.(); const cs = await listCourses(t); if (ok) setCourses(cs); }
      catch { if (ok) setCourses([]); }
    })();
    return () => { ok = false; };
  }, [getToken]);

  const selectedCourse = useMemo(
    () => (courses || []).find((c) => String(c.id) === String(courseId)) || null, [courses, courseId]);

  // Route ops for the shared CoursePicker (select existing / import GPX / draw on map). Same
  // component the live ride uses; here "select" just picks the event's route (no ride to follow),
  // so we reload the list on every pick so a freshly imported/drawn course resolves by name.
  const courseOps = useMemo(() => ({
    list: async () => listCourses(await getToken?.()),
    select: async (id) => {
      setCourseId(id ? String(id) : '');
      try { setCourses(await listCourses(await getToken?.())); } catch { /* keep existing list */ }
    },
    clear: () => setCourseId(''),
    save: async (name, points, distanceKm) => createCourse(await getToken?.(), { name, points, distanceKm }),
    importUrl: async (url) => importCourseFromUrl(await getToken?.(), url),
    remove: async (id) => {
      await deleteCourse(await getToken?.(), id);
      setCourses((cs) => (cs || []).filter((c) => String(c.id) !== String(id)));
      if (String(id) === String(courseId)) setCourseId('');
    },
    selected: selectedCourse || (courseId ? { id: courseId } : null),
  }), [getToken, selectedCourse, courseId]);

  // Load the picked course's points for the preview map (the coach owns it → getCourse resolves).
  useEffect(() => {
    if (!courseId) { setRoutePts(null); return undefined; }
    let ok = true;
    (async () => {
      try { const c = await getCourse(await getToken?.(), courseId); if (ok) setRoutePts(c?.points?.length > 1 ? c.points : null); }
      catch { if (ok) setRoutePts(null); }
    })();
    return () => { ok = false; };
  }, [courseId, getToken]);

  const hasRoute = routePts && routePts.length > 1;
  const routeStart = useMemo(
    () => (routePts || []).find((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) || null, [routePts]);
  // Off-road basemap only makes sense over Israel (blank tiles elsewhere); fall back otherwise.
  const israel = useMemo(() => (routeStart ? inIsrael(routeStart[0], routeStart[1]) : true), [routeStart]);
  const cycleLayer = () => setMapStyle((st) => nextBasemap(st, israel));
  useEffect(() => { if (!israel && mapStyle === 'offroad') setMapStyle(defaultBasemap(false)); }, [israel, mapStyle]);
  useEffect(() => { persistMapStyle(mapStyle); }, [mapStyle]);

  // ── per-event branding (edit mode only — needs a saved event id to attach images to) ──
  const bannerInput = useRef(null);
  const logoInput = useRef(null);
  const [logoUrl, setLogoUrl] = useState(editing?.logoUrl || null);
  const [bannerUrl, setBannerUrl] = useState(editing?.bannerUrl || null);
  const [imgBusy, setImgBusy] = useState('');
  const [imgErr, setImgErr] = useState('');
  const [imgEditing, setImgEditing] = useState(null); // { kind, img } — crop/zoom/pan editor
  const evSquadId = editing?.squadId || squadId;
  const imgBase = editing ? `/api/images/squads/${String(evSquadId).toLowerCase()}/events/${String(editing.id).toLowerCase()}` : null;

  // Pick a file → open the crop/zoom/pan editor (square for the logo, wide for the banner).
  const pickImage = (kind) => async (e) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file || !editing) return;
    setImgErr('');
    try {
      setImgEditing({ kind, img: await loadImageFile(file) });
    } catch (ex) { setImgErr(ex.message || 'Could not use that image.'); }
  };

  const closeImgEditor = () => { imgEditing?.img?.close?.(); setImgEditing(null); };

  // The editor hands back a cropped JPEG data URL → upload it as the event logo/banner.
  const applyImage = async (dataUrl) => {
    const kind = imgEditing?.kind;
    closeImgEditor();
    if (!kind || !editing) return;
    setImgBusy(kind); setImgErr('');
    try {
      const t = await getToken?.();
      await uploadEventImage(t, evSquadId, editing.id, kind, dataUrlToBlob(dataUrl));
      const url = `${imgBase}/${kind}`;
      bustAuthedImage(url);
      if (kind === 'banner') setBannerUrl(url); else setLogoUrl(url);
      onDataChanged?.();
    } catch (ex) { setImgErr(ex.message || 'Upload failed.'); }
    finally { setImgBusy(''); }
  };
  const removeImage = (kind) => async () => {
    if (!editing) return;
    setImgBusy(kind); setImgErr('');
    try {
      await deleteEventImage(await getToken?.(), evSquadId, editing.id, kind);
      if (kind === 'banner') setBannerUrl(null); else setLogoUrl(null);
      onDataChanged?.();
    } catch (ex) { setImgErr(ex.message || 'Could not remove.'); }
    finally { setImgBusy(''); }
  };

  const canSave = title.trim() && when && !busy;

  // mode: 'publish' | 'draft' (create) or 'save' (edit). published only applies on create.
  const save = async (mode) => {
    if (!title.trim()) { setError('Give the session a title.'); return; }
    const start = toOffsetIso(when);
    if (!start) { setError('Pick a valid date and time.'); return; }
    setBusy(mode); setError('');
    try {
      const tok = await getToken?.();
      const body = { title: title.trim(), sport, start, courseId: courseId || null, notes: notes.trim() || null };
      if (isEdit) await updateSquadEvent(tok, squadId, editing.id, body);
      else await createSquadEvent(tok, squadId, { ...body, published: mode === 'publish' });
      onDataChanged?.();
      actions.go('events');
    } catch (e) {
      setError(e?.message || 'Could not save the session.');
      setBusy('');
    }
  };

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      {/* back + "New event" / "Edit event" title now in the global app header */}

      <div style={s('display:flex;flex-direction:column;gap:12px;margin-top:14px')}>
        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Saturday morning ride" style={s(inputStyle)} />
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Type</div>
          <div style={s('display:flex;gap:7px')}>
            {sportOptions.map((o) => (
              <div key={o.v} className="ctl" onClick={() => setSport(o.v)}
                style={s(`flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border-radius:10px;font-size:12px;font-weight:700;border:1px solid ${sport === o.v ? 'var(--accent)' : 'var(--line)'};background:${sport === o.v ? 'var(--accent-dim)' : 'var(--bg3)'};color:${sport === o.v ? 'var(--accent)' : 'var(--text2)'}`)}>
                <SportIcon name={o.glyph} size={16} />{o.label}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Date &amp; time</div>
          <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={s(inputStyle)} />
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Route</div>
          <div className="ctl" onClick={() => setPicker(true)}
            style={s(inputStyle + ';display:flex;align-items:center;gap:10px;cursor:pointer')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={selectedCourse ? 'var(--accent)' : 'var(--text3)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s('flex:none')}><path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <span style={s(`flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${selectedCourse ? 'var(--text)' : 'var(--text3)'}`)}>
              {selectedCourse
                ? `${selectedCourse.name}${selectedCourse.distanceKm ? ` · ${selectedCourse.distanceKm.toFixed(1)} km` : ''}`
                : (courses === null ? 'Loading routes…' : 'Select, import, or draw a route')}
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={s('flex:none')}><path d="M9 18l6-6-6-6" /></svg>
          </div>

          {/* selected route previewed on a map — tap ⤢ to expand fullscreen */}
          {hasRoute && (
            <div style={s('position:relative;margin-top:10px;border-radius:16px;overflow:hidden;border:1px solid var(--line);height:190px')}>
              <RouteMapGL route={routePts} styleName={mapStyle} routeColor={rstyle.color} routeWidth={rstyle.width} arrowColor={rstyle.arrowColor} />
              <div style={s('position:absolute;top:10px;right:10px;z-index:5;display:flex;flex-direction:column;gap:8px')}>
                <div className="ctl" onClick={() => setMapFull(true)} aria-label="Expand map"
                  style={s(`width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;line-height:1;${glass}`)}>⤢</div>
                <div className="ctl" onClick={cycleLayer} title={`Map: ${BASEMAP_LABEL[mapStyle] || mapStyle}`}
                  style={s(`width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;${glass}`)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Notes</div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Meeting point, pace, what to bring…"
            style={s(inputStyle + ';resize:vertical;line-height:1.4')} />
        </div>

        {isEdit ? (
          <div>
            <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;font-weight:600;margin:0 2px 7px')}>Branding · optional</div>
            <div className="ctl" onClick={() => bannerInput.current?.click()}
              style={s('position:relative;height:120px;border-radius:14px;overflow:hidden;border:1px dashed var(--line2);background:var(--bg3);display:flex;align-items:center;justify-content:center')}>
              {bannerUrl
                ? <AuthedImage url={bannerUrl} token={getToken?.()} style="width:100%;height:100%;object-fit:cover" />
                : <span style={s('font-size:12.5px;color:var(--text3)')}>{imgBusy === 'banner' ? 'Uploading…' : '+ Event banner'}</span>}
            </div>
            <div style={s('display:flex;align-items:center;gap:12px;margin-top:10px')}>
              <div className="ctl" onClick={() => logoInput.current?.click()}
                style={s('width:56px;height:56px;border-radius:14px;overflow:hidden;border:1px dashed var(--line2);background:var(--bg3);display:flex;align-items:center;justify-content:center;flex:none')}>
                {logoUrl
                  ? <AuthedImage url={logoUrl} token={getToken?.()} style="width:100%;height:100%;object-fit:cover" />
                  : <span style={s('font-size:22px;color:var(--text3);line-height:1')}>{imgBusy === 'logo' ? '…' : '+'}</span>}
              </div>
              <div style={s('flex:1;font-size:12px;color:var(--text3);line-height:1.4')}>Logo + banner shown on the event card and its page.</div>
              {(logoUrl || bannerUrl) && (
                <div className="ctl" onClick={() => { if (logoUrl) removeImage('logo')(); if (bannerUrl) removeImage('banner')(); }} style={s('font-size:11.5px;font-weight:700;color:var(--bad);flex:none')}>Clear</div>
              )}
            </div>
            {imgErr && <div style={s('font-size:11.5px;color:var(--bad);margin-top:6px')}>{imgErr}</div>}
            <input ref={bannerInput} type="file" accept="image/*" onChange={pickImage('banner')} style={s('display:none')} />
            <input ref={logoInput} type="file" accept="image/*" onChange={pickImage('logo')} style={s('display:none')} />
            {imgEditing && (
              <ImageEditor
                img={imgEditing.img}
                aspect={imgEditing.kind === 'banner' ? 2 : 1}
                outWidth={imgEditing.kind === 'banner' ? 1600 : 512}
                title={imgEditing.kind === 'banner' ? 'Position banner' : 'Position logo'}
                onCancel={closeImgEditor}
                onDone={applyImage}
              />
            )}
          </div>
        ) : (
          <div style={s('font-size:11.5px;color:var(--text3);line-height:1.4;padding:2px')}>Tip: save the event, then reopen it to add a banner and logo.</div>
        )}

        {error && <div style={s('font-size:12.5px;color:var(--bad);font-weight:600')}>{error}</div>}

        {isEdit ? (
          <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('save') : undefined}
            style={s(`text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:14px;background:var(--accent);color:var(--accent-ink);opacity:${canSave ? 1 : 0.5}`)}>
            {busy === 'save' ? 'Saving…' : 'Save changes'}
          </div>
        ) : (
          <div style={s('display:flex;gap:9px')}>
            <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('draft') : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:13.5px;background:var(--bg3);border:1px solid var(--line);color:var(--text);opacity:${canSave ? 1 : 0.5}`)}>
              {busy === 'draft' ? 'Saving…' : 'Save as draft'}
            </div>
            <div className={canSave ? 'ctl' : undefined} onClick={canSave ? () => save('publish') : undefined}
              style={s(`flex:1;text-align:center;padding:13px;border-radius:13px;font-weight:700;font-size:13.5px;background:var(--accent);color:var(--accent-ink);opacity:${canSave ? 1 : 0.5}`)}>
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </div>
          </div>
        )}
      </div>

      {picker && (
        <CoursePicker courses={courseOps} onClose={() => setPicker(false)} title="Route for this event" allowSaveRide={false} />
      )}

      {/* fullscreen route map — covers the whole screen */}
      {mapFull && hasRoute && (
        <div style={s('position:fixed;inset:0;z-index:300;background:var(--bg)')}>
          <RouteMapGL route={routePts} styleName={mapStyle} routeColor={rstyle.color} routeWidth={rstyle.width} arrowColor={rstyle.arrowColor} fitPadding={70} />
          <div style={s('position:absolute;top:16px;right:16px;z-index:5;display:flex;flex-direction:column;gap:8px')}>
            <div className="ctl" onClick={() => setMapFull(false)} aria-label="Close map"
              style={s(`width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;${glass}`)}>✕</div>
            <div className="ctl" onClick={cycleLayer} title={`Map: ${BASEMAP_LABEL[mapStyle] || mapStyle}`}
              style={s(`width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;${glass}`)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
