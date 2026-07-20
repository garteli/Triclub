// Coach plan publishing. The coach builds a multi-week block in the Plan editor;
// publishing writes each assigned athlete's PlannedWorkout rows on real dates.
// Thin fetch wrapper; the caller supplies the bearer token.

// body: { athleteIds:[guid], planName?, startDate:'yyyy-mm-dd', weeks:int,
//         workouts:[{ date:'yyyy-mm-dd', discipline, title, sub, durationMin, load }] }
// → { published: <athlete count> }
export async function publishPlan(token, body) {
  const res = await fetch('/api/plan/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data?.error || `Publish failed (${res.status})`);
  return data;
}
