import { useCallback, useRef, useState } from 'react';
import { s } from '../lib/style.js';
import { apiUrl } from '../lib/apiBase.js';
import { extractFitFiles, isSupportedUpload } from '../lib/fitArchive.js';

// Mirrors the server guards in ActivityIntakeEndpoints.cs so bad files fail fast,
// client-side, before we waste an upload.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — the server's per-.fit cap
const ACCEPT = '.fit,.gz,.zip';
// How many extracted fits to upload at once inside a batch. Keeps a big Garmin export
// moving without opening hundreds of parallel requests.
const BATCH_CONCURRENCY = 5;

let seq = 0;

function fmtSize(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

// XHR (not fetch) so we get real upload-progress events.
function uploadOne(file, { endpoint, token, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(endpoint));
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      // The endpoint returns 202 Accepted — the file is queued, not yet parsed.
      if (xhr.status === 202) {
        try { resolve(JSON.parse(xhr.responseText)); }
        catch { resolve({ status: 'queued' }); }
      } else if (xhr.status === 401) {
        reject(new Error('Not signed in.'));
      } else {
        reject(new Error(xhr.responseText?.slice(0, 140) || `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error.'));
    const fd = new FormData();
    fd.append('file', file, file.name);
    xhr.send(fd);
  });
}

const UploadGlyph = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

const FileIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--bike)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
);
const ArchiveIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--bike)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
);

function StatusPill({ item }) {
  if (item.status === 'error')
    return <span style={s('font-size:10px;font-weight:700;color:var(--bad);background:color-mix(in srgb,var(--bad) 16%,transparent);padding:3px 8px;border-radius:6px')}>Failed</span>;
  if (item.status === 'uploading')
    return <span className="mono" style={s('font-size:11px;color:var(--text2)')}>{item.progress}%</span>;
  const dup = item.result?.status === 'already-received';
  return (
    <span style={s(`font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:${dup ? 'var(--text3)' : 'var(--good)'};background:${dup ? 'var(--bg4)' : 'color-mix(in srgb,var(--good) 16%,transparent)'}`)}>
      {dup ? 'Already received' : 'Queued'}
    </span>
  );
}

// One activity file (loose .fit or single .fit.gz) in the queue.
function FileRow({ it, onRemove }) {
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div style={s('width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bike) 16%,transparent)')}><FileIcon /></div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{it.name}</div>
          <div style={s('font-size:11px;color:var(--text3)')}>{fmtSize(it.size)}</div>
        </div>
        <StatusPill item={it} />
        {it.status !== 'uploading' && (
          <div className="ctl" onClick={onRemove} style={s('color:var(--text3);font-size:16px;line-height:1;padding:2px 4px')}>×</div>
        )}
      </div>
      {it.status === 'uploading' && (
        <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:9px;overflow:hidden')}>
          <div style={s(`height:100%;width:${it.progress}%;background:var(--accent);border-radius:3px;transition:width .15s`)} />
        </div>
      )}
      {it.status === 'done' && it.result?.status !== 'already-received' && (
        <div style={s('font-size:11px;color:var(--text3);margin-top:8px')}>Processing — it’ll appear in the squad feed once parsed.</div>
      )}
      {it.status === 'error' && (
        <div style={s('font-size:11.5px;color:var(--bad);margin-top:8px')}>{it.error}</div>
      )}
    </div>
  );
}

// An archive (.zip) or expanded bundle — shown as a single aggregate card with rolling
// counts, so a multi-thousand-activity Garmin export doesn't render a row per file.
function BatchRow({ it, onRemove }) {
  const total = it.total || 0;
  const settled = it.uploaded + it.duplicates + it.failed;
  const pct = total > 0 ? Math.round((settled / total) * 100) : 0;
  const busy = it.status === 'expanding' || it.status === 'uploading';
  return (
    <div style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px')}>
      <div style={s('display:flex;align-items:center;gap:11px')}>
        <div style={s('width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bike) 16%,transparent)')}><ArchiveIcon /></div>
        <div style={s('flex:1;min-width:0')}>
          <div style={s('font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{it.name}</div>
          <div style={s('font-size:11px;color:var(--text3)')}>
            {it.status === 'expanding' ? 'Reading archive…'
              : total === 0 ? 'No .fit activities found'
              : `${total} activit${total === 1 ? 'y' : 'ies'}${busy ? ` · ${settled}/${total}` : ''}`}
          </div>
        </div>
        {it.status === 'expanding'
          ? <span className="mono" style={s('font-size:11px;color:var(--text2)')}>…</span>
          : it.status === 'error'
          ? <span style={s('font-size:10px;font-weight:700;color:var(--bad);background:color-mix(in srgb,var(--bad) 16%,transparent);padding:3px 8px;border-radius:6px')}>Failed</span>
          : it.status === 'uploading'
          ? <span className="mono" style={s('font-size:11px;color:var(--text2)')}>{pct}%</span>
          : <span style={s('font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px;color:var(--good);background:color-mix(in srgb,var(--good) 16%,transparent)')}>Done</span>}
        {!busy && (
          <div className="ctl" onClick={onRemove} style={s('color:var(--text3);font-size:16px;line-height:1;padding:2px 4px')}>×</div>
        )}
      </div>

      {it.status === 'uploading' && total > 0 && (
        <div style={s('height:4px;background:var(--bg4);border-radius:3px;margin-top:9px;overflow:hidden')}>
          <div style={s(`height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .15s`)} />
        </div>
      )}
      {it.error && (
        <div style={s('font-size:11.5px;color:var(--bad);margin-top:8px')}>{it.error}</div>
      )}
      {(it.status === 'done' || it.status === 'uploading') && total > 0 && (
        <div style={s('font-size:11.5px;color:var(--text2);margin-top:8px;line-height:1.5')}>
          <b style={s('color:var(--good)')}>{it.uploaded}</b> queued
          {it.duplicates > 0 && <> · {it.duplicates} already had</>}
          {it.failed > 0 && <> · <span style={s('color:var(--bad)')}>{it.failed} failed</span></>}
          {it.status === 'done' && it.uploaded > 0 && ' — they’ll appear in the feed as they’re parsed.'}
        </div>
      )}
    </div>
  );
}

// Run `worker` over `items` with at most `limit` in flight at once.
async function runPool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

export default function ActivityUpload({ endpoint = '/api/activities/upload', getToken, onUploaded }) {
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const patch = (id, next) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...(typeof next === 'function' ? next(it) : next) } : it)));

  // A loose .fit / .fit.gz → one queue row, one upload.
  const handleSingle = useCallback(async (id, name, bytes, token) => {
    if (bytes.length > MAX_BYTES) { patch(id, { status: 'error', error: 'File too large (max 25 MB)' }); return; }
    try {
      const file = new File([bytes], name, { type: 'application/octet-stream' });
      const result = await uploadOne(file, { endpoint, token, onProgress: (p) => patch(id, { progress: p }) });
      patch(id, { status: 'done', progress: 100, result });
      onUploaded?.(result);
    } catch (err) {
      patch(id, { status: 'error', error: err.message });
    }
  }, [endpoint, onUploaded]);

  // An archive → expand client-side, then upload every extracted fit with limited
  // concurrency, tracking rolling counts on the one batch row.
  const handleArchive = useCallback(async (id, file, token) => {
    let fits;
    try {
      fits = await extractFitFiles(file);
    } catch (err) {
      patch(id, { status: 'error', error: err.message || 'Could not read archive' });
      return;
    }
    if (fits.length === 0) { patch(id, { status: 'done', total: 0 }); return; }

    patch(id, { status: 'uploading', total: fits.length });
    let queuedAny = false;
    await runPool(fits, BATCH_CONCURRENCY, async ({ name, bytes }) => {
      if (bytes.length > MAX_BYTES) { patch(id, (it) => ({ failed: it.failed + 1 })); return; }
      try {
        const f = new File([bytes], name, { type: 'application/octet-stream' });
        const result = await uploadOne(f, { endpoint, token });
        if (result?.status === 'already-received') patch(id, (it) => ({ duplicates: it.duplicates + 1 }));
        else { patch(id, (it) => ({ uploaded: it.uploaded + 1 })); queuedAny = true; }
      } catch {
        patch(id, (it) => ({ failed: it.failed + 1 }));
      }
    });
    patch(id, { status: 'done' });
    if (queuedAny) onUploaded?.({ status: 'queued' });
  }, [endpoint, onUploaded]);

  const addFiles = useCallback(async (fileList) => {
    for (const file of Array.from(fileList)) {
      const id = ++seq;
      const name = file.name;
      const archive = /\.zip$/i.test(name);

      if (!isSupportedUpload(name)) {
        setItems((prev) => [{ id, kind: 'file', name, size: file.size, status: 'error', progress: 0, error: 'Only .fit, .fit.gz or .zip files are accepted', result: null }, ...prev]);
        continue;
      }
      if (file.size === 0) {
        setItems((prev) => [{ id, kind: 'file', name, size: file.size, status: 'error', progress: 0, error: 'Empty file', result: null }, ...prev]);
        continue;
      }

      let token;
      try { token = getToken ? await getToken() : null; }
      catch { setItems((prev) => [{ id, kind: 'file', name, size: file.size, status: 'error', progress: 0, error: 'Not signed in.', result: null }, ...prev]); continue; }

      if (archive) {
        setItems((prev) => [{ id, kind: 'batch', name, status: 'expanding', total: 0, uploaded: 0, duplicates: 0, failed: 0, error: null }, ...prev]);
        await handleArchive(id, file, token);
      } else {
        // .fit or .fit.gz — expand a lone gz to its fit bytes, otherwise use the file as-is.
        setItems((prev) => [{ id, kind: 'file', name, size: file.size, status: 'uploading', progress: 0, error: null, result: null }, ...prev]);
        let bytes;
        try {
          const [fit] = await extractFitFiles(file);
          if (!fit) { patch(id, { status: 'error', error: 'No .fit data in file' }); continue; }
          bytes = fit.bytes;
        } catch (err) {
          patch(id, { status: 'error', error: err.message || 'Could not read file' });
          continue;
        }
        await handleSingle(id, name.replace(/\.gz$/i, ''), bytes, token);
      }
    }
  }, [getToken, handleArchive, handleSingle]);

  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const busy = items.some((it) => it.status === 'uploading' || it.status === 'expanding');
  const remove = (id) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <div style={s('padding:6px 18px 0;animation:floatUp .35s ease')}>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Add training</div>
      <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px;margin-bottom:4px')}>Upload activity</div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-bottom:16px')}>Drop a <span className="mono">.fit</span> from any device — Garmin, Wahoo, Zwift — or a whole <span className="mono">.zip</span> export to import your history at once. We dedupe automatically.</div>

      {/* drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={s(`display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:34px 18px;border-radius:20px;cursor:pointer;transition:all .15s;border:1.5px dashed ${drag ? 'var(--accent)' : 'var(--line2)'};background:${drag ? 'var(--accent-dim)' : 'var(--bg2)'}`)}
      >
        <div style={s('width:52px;height:52px;border-radius:16px;background:color-mix(in srgb,var(--accent) 16%,transparent);display:flex;align-items:center;justify-content:center')}><UploadGlyph /></div>
        <div style={s('font-size:14.5px;font-weight:700')}>{drag ? 'Drop to upload' : 'Drag & drop, or tap to browse'}</div>
        <div style={s('font-size:11.5px;color:var(--text3)')}>.fit · .fit.gz · .zip export</div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

      {/* queue */}
      {items.length > 0 && (
        <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:16px')}>
          {items.map((it) => (
            it.kind === 'batch'
              ? <BatchRow key={it.id} it={it} onRemove={() => remove(it.id)} />
              : <FileRow key={it.id} it={it} onRemove={() => remove(it.id)} />
          ))}
        </div>
      )}

      {busy && <div style={s('text-align:center;font-size:11px;color:var(--text3);margin-top:14px')}>Uploading…</div>}
    </div>
  );
}
