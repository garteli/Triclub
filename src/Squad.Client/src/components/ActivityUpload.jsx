import { useCallback, useRef, useState } from 'react';
import { s } from '../lib/style.js';

// Mirrors the server guards in ActivityIntakeEndpoints.cs so bad files fail fast,
// client-side, before we waste an upload.
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ACCEPT = '.fit';

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
    xhr.open('POST', endpoint);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
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

export default function ActivityUpload({ endpoint = '/api/activities/upload', getToken, onUploaded }) {
  const [items, setItems] = useState([]);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);

  const patch = (id, next) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));

  const addFiles = useCallback(async (fileList) => {
    for (const file of Array.from(fileList)) {
      const id = ++seq;
      const bad = !file.name.toLowerCase().endsWith('.fit') ? 'Only .fit files are accepted'
        : file.size === 0 ? 'Empty file'
        : file.size > MAX_BYTES ? 'File too large (max 25 MB)'
        : null;

      setItems((prev) => [
        { id, name: file.name, size: file.size, status: bad ? 'error' : 'uploading', progress: 0, error: bad, result: null },
        ...prev,
      ]);
      if (bad) continue;

      try {
        const token = getToken ? await getToken() : null;
        const result = await uploadOne(file, { endpoint, token, onProgress: (p) => patch(id, { progress: p }) });
        patch(id, { status: 'done', progress: 100, result });
        onUploaded?.(result);
      } catch (err) {
        patch(id, { status: 'error', error: err.message });
      }
    }
  }, [endpoint, getToken, onUploaded]);

  const onDrop = (e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); };
  const pending = items.some((it) => it.status === 'uploading');

  return (
    <div style={s('padding:6px 18px 120px;animation:floatUp .35s ease')}>
      <div style={s('font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:1.6px;font-weight:600')}>Add training</div>
      <div style={s('font-size:23px;font-weight:700;letter-spacing:-.5px;margin-bottom:4px')}>Upload activity</div>
      <div style={s('font-size:12.5px;color:var(--text2);margin-bottom:16px')}>Drop a <span className="mono">.fit</span> from any device — Garmin, Wahoo, Zwift. We dedupe automatically.</div>

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
        <div style={s('font-size:11.5px;color:var(--text3)')}>.fit · up to 25 MB each</div>
      </div>
      <input ref={inputRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />

      {/* queue */}
      {items.length > 0 && (
        <div style={s('display:flex;flex-direction:column;gap:9px;margin-top:16px')}>
          {items.map((it) => (
            <div key={it.id} style={s('background:var(--bg2);border:1px solid var(--line);border-radius:14px;padding:12px 13px')}>
              <div style={s('display:flex;align-items:center;gap:11px')}>
                <div style={s(`width:34px;height:34px;border-radius:10px;flex:none;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--bike) 16%,transparent)`)}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--bike)" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                </div>
                <div style={s('flex:1;min-width:0')}>
                  <div style={s('font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{it.name}</div>
                  <div style={s('font-size:11px;color:var(--text3)')}>{fmtSize(it.size)}</div>
                </div>
                <StatusPill item={it} />
                {it.status !== 'uploading' && (
                  <div className="ctl" onClick={() => setItems((prev) => prev.filter((x) => x.id !== it.id))} style={s('color:var(--text3);font-size:16px;line-height:1;padding:2px 4px')}>×</div>
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
          ))}
        </div>
      )}

      {pending && <div style={s('text-align:center;font-size:11px;color:var(--text3);margin-top:14px')}>Uploading…</div>}
    </div>
  );
}
