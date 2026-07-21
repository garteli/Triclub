// Coach plan publishing. The coach builds a multi-week block in the Plan editor;
// publishing writes each assigned athlete's PlannedWorkout rows on real dates.
// Thin fetch wrapper; the caller supplies the bearer token.

// body: { athleteIds:[guid], planName?, startDate:'yyyy-mm-dd', weeks:int,
//         workouts:[{ date:'yyyy-mm-dd', discipline, title, sub, durationMin, load }] }
// → { published: <athlete count> }
async function req(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

// body: { athleteIds, planId?, planName?, startDate, weeks, workouts } — publish the whole plan or one week.
export const publishPlan = (token, body) => req('/api/plan/publish', { method: 'POST', token, body });
// Coach pulls a published plan back off every athlete's calendar. → { unpublished: <rows> }
export const unpublishPlan = (token, id) => req(`/api/plan/plans/${id}/unpublish`, { method: 'POST', token });
// An athlete's own assigned plans, and removing one from their own calendar.
export const listMyPlans = (token) => req('/api/plan/mine', { token });
export const removeMyPlan = (token, planId) => req(`/api/plan/mine/${planId}`, { method: 'DELETE', token });

// A coach's saved plans (they can have many).
export const listPlans = (token) => req('/api/plan/plans', { token });
export const getPlan = (token, id) => req(`/api/plan/plans/${id}`, { token });
// body: { id?, name, doc, squadId? } — doc is a JSON string of the editor state.
export const savePlan = (token, body) => req('/api/plan/plans', { method: 'POST', token, body });
export const deletePlan = (token, id) => req(`/api/plan/plans/${id}`, { method: 'DELETE', token });

// Import a PDF training plan (async): the server accepts the PDF, runs an AI pass in the
// background to parse it into our plan format, and saves it as a new plan. This POST returns
// quickly with a job id; poll getImportStatus until it's done. `opts` = { anchorType, anchorDate }.
// → { jobId }. Multipart body — do NOT set Content-Type; the browser adds the boundary.
export async function importPlanPdf(token, file, { anchorType = 'start', anchorDate } = {}) {
  const fd = new FormData();
  fd.append('file', file, file.name);
  fd.append('anchorType', anchorType);
  if (anchorDate) fd.append('anchorDate', anchorDate);
  const res = await fetch('/api/plan/import', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Import failed (${res.status})`);
  return data; // { jobId, status }
}

// Poll an import job. → { status: 'pending'|'running'|'done'|'error', planId?, name?, error? }.
export const getImportStatus = (token, jobId) => req(`/api/plan/import/${jobId}`, { token });

// ── Plan library: browse pre-generated templates and adopt one as your own plan ──
// → [{ id, distance, level, goalLabel, name, weeks, sortOrder }]
export const listLibrary = (token) => req('/api/plan/library', { token });
// → { id, distance, goalLabel, name, weeks, doc }
export const getLibraryTemplate = (token, id) => req(`/api/plan/library/${id}`, { token });
// body: { anchorType:'start'|'target', anchorDate?:'yyyy-mm-dd' } → { id, name }
export const adoptTemplate = (token, id, body) => req(`/api/plan/library/${id}/adopt`, { method: 'POST', token, body });
