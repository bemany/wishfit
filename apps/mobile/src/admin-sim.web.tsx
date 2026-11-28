import { useCallback, useEffect, useRef, useState } from 'react';

import { API_URL } from './api';
import { Btn, s, when } from './admin-ui.web';
import { clearImpersonation } from './impersonation';
import { C, F } from './theme';

export type Sim = { token: string; user: { id: string; email: string; language?: string | null }; expires_at: string };

export const SIM_MIN = 340;
export const SIM_MAX = 720;
export const SIM_DEFAULT = 460;
const WIDTH_KEY = 'wishfit-admin:simwidth';

export const loadSimWidth = () => {
  try {
    const n = Number(localStorage.getItem(WIDTH_KEY));
    return n >= SIM_MIN && n <= SIM_MAX ? n : SIM_DEFAULT;
  } catch {
    return SIM_DEFAULT;
  }
};
export const saveSimWidth = (n: number) => {
  try {
    localStorage.setItem(WIDTH_KEY, String(Math.round(n)));
  } catch {
    // no localStorage: the width is not kept
  }
};

// The user's app in an iPhone frame, docked as a column on the right of the console (a full-screen layer on a
// narrow window). The token goes in the fragment (never sent to a server, removed by the app at once); the app
// inside keeps its data in sessionStorage under wishfit:imp:<userId>:
export function Simulator({ sim, close, docked, width, onWidth }: { sim: Sim; close: () => void; docked: boolean; width: number; onWidth: (n: number) => void }) {
  const [box, setBox] = useState({ w: width, h: window.innerHeight });
  const [expired, setExpired] = useState(false);
  const released = useRef(false);
  const column = useRef<HTMLDivElement>(null);
  // ends the session on the server and forgets the view's data; also when the simulator goes away without End
  // (another page in the console, a closed tab), so no token outlives it in this tab
  const release = useCallback(() => {
    if (released.current) return;
    released.current = true;
    fetch(`${API_URL}/admin/impersonate`, { method: 'DELETE', headers: { Authorization: `Bearer ${sim.token}` }, keepalive: true }).catch(() => {});
    clearImpersonation(`wishfit:imp:${sim.user.id}:`);
  }, [sim]);
  const end = useCallback(() => {
    release();
    close();
  }, [release, close]);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type?: string; reason?: string } | null;
      if (e.origin !== window.location.origin || data?.type !== 'wishfit-imp-end' || released.current) return;
      if (data.reason === 'expired') {
        // the server no longer takes the session: say so instead of closing without a word
        release();
        setExpired(true);
      } else end();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', release);
    };
  }, [end, release]);
  useEffect(() => release, [release]);
  // the phone shrinks to the column
  useEffect(() => {
    const el = column.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = Math.max(0.3, Math.min(1, (box.h - 100) / 868, (box.w - 24) / 414));

  const drag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const move = (m: PointerEvent) => onWidth(Math.max(SIM_MIN, Math.min(SIM_MAX, window.innerWidth - m.clientX, window.innerWidth - 420)));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.userSelect = '';
      if (frame) frame.style.pointerEvents = '';
    };
    // the frame would swallow the pointer while it passes over it
    const frame = column.current?.querySelector('iframe');
    if (frame) frame.style.pointerEvents = 'none';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const hash = new URLSearchParams({ t: sim.token, u: sim.user.id, e: sim.user.email, l: sim.user.language === 'de' ? 'de' : 'en' });
  return (
    <div
      ref={column}
      data-testid="simulator"
      data-docked={docked ? '1' : '0'}
      style={{
        ...(docked ? { position: 'relative', width, flexShrink: 0, height: '100vh', borderLeft: `1.5px solid ${C.ink}` } : { position: 'fixed', inset: 0, zIndex: 10 }),
        background: '#26262a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {docked && <div data-testid="sim-resize" onPointerDown={drag} title="Drag to resize" style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 9, cursor: 'col-resize', zIndex: 3 }} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', color: C.paper, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: F.semi, wordBreak: 'break-all' }}>Viewing as {sim.user.email}</span>
        <span style={{ ...s.mono, opacity: 0.7 }}>until {when(sim.expires_at)}</span>
        <Btn testId="sim-end" danger onClick={end}>End view</Btn>
      </div>
      {expired ? (
        <div data-testid="sim-expired" style={{ ...s.card, background: C.paper, maxWidth: 360, margin: 24 }}>
          <div style={{ fontFamily: F.display, fontSize: 20 }}>View expired</div>
          <p style={{ ...s.mute, margin: '6px 0 12px' }}>The session for {sim.user.email} has ended (views last 30 minutes). Start it again from the user.</p>
          <Btn primary onClick={close}>Close</Btn>
        </div>
      ) : (
        <div style={{ width: 414 * fit, height: 868 * fit, flexShrink: 0 }}>
          <div style={{ width: 414, height: 868, transform: `scale(${fit})`, transformOrigin: 'top left', borderRadius: 64, background: C.ink, padding: 12, boxSizing: 'border-box', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <iframe
              data-testid="sim-frame"
              title={`Wishfit as ${sim.user.email}`}
              src={`/?imp=1#${hash.toString()}`}
              style={{ width: 390, height: 844, border: 0, borderRadius: 52, background: C.paper, display: 'block' }}
            />
            <div style={{ position: 'absolute', top: 22, left: '50%', marginLeft: -62, width: 124, height: 34, borderRadius: 20, background: C.ink, pointerEvents: 'none' }} />
          </div>
        </div>
      )}
    </div>
  );
}
