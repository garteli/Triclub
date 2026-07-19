import { s } from '../lib/style.js';

export default function Messages({ vm, actions }) {
  return (
    <div style={s('padding:6px 0 120px;animation:floatUp .35s ease;display:flex;flex-direction:column;height:100%')}>
      {/* header */}
      <div style={s('display:flex;align-items:center;gap:11px;padding:2px 18px 12px;border-bottom:1px solid var(--line)')}>
        <div className="ctl" onClick={() => actions.go('discover')} style={s('width:32px;height:32px;border-radius:9px;background:var(--bg2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center')}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6" /></svg>
        </div>
        <div style={s('width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#37c0ff,#5a86ff);flex:none;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff')}>R</div>
        <div style={s('flex:1')}><div style={s('font-size:14px;font-weight:700')}>Coach Ronen</div><div style={s('font-size:11px;color:var(--good)')}>● online</div></div>
      </div>

      {/* thread */}
      <div style={s('padding:16px 18px;display:flex;flex-direction:column;gap:11px')}>
        {vm.chatThread.map((m, i) => (
          <div key={i} style={s('display:flex;flex-direction:column;max-width:80%;' + m.wrap)}>
            <div style={s(m.bubble)}>{m.text}</div>
            <span style={s('font-size:9.5px;color:var(--text3);margin-top:3px;' + m.timeAlign)}>{m.time}</span>
          </div>
        ))}
      </div>

      {/* composer */}
      <div style={s('margin-top:auto;padding:12px 18px;display:flex;gap:9px;align-items:center;border-top:1px solid var(--line)')}>
        <div style={s('flex:1;background:var(--bg2);border:1px solid var(--line);border-radius:20px;padding:11px 15px;font-size:13px;color:var(--text3)')}>Message…</div>
        <div className="ctl" style={s('width:40px;height:40px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
        </div>
      </div>
    </div>
  );
}
