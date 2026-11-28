import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { getLanguage } from './i18n';
import { C, F } from './theme';

// Small shared pieces of the admin console (web only): colours, styles, buttons, formatting

export const RED = '#d92d20';
export const LINE = '#e6e6e9';
export const SOFT = '#f6f6f7';

export const when = (iso?: string | null) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
};
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const s = {
  page: { height: '100vh', overflow: 'auto', background: C.paper, color: C.ink, fontFamily: F.text, fontSize: 14 } as CSSProperties,
  wrap: { maxWidth: 1280, margin: '0 auto', padding: '16px 16px 48px' } as CSSProperties,
  h1: { fontFamily: F.display, fontSize: 26, margin: 0, letterSpacing: -0.5 } as CSSProperties,
  h2: { fontFamily: F.display, fontSize: 20, margin: '20px 0 8px' } as CSSProperties,
  mono: { fontFamily: F.mono, fontSize: 12 } as CSSProperties,
  mute: { color: C.mute } as CSSProperties,
  input: { fontFamily: F.text, fontSize: 14, padding: '9px 12px', border: `1.5px solid ${C.ink}`, borderRadius: 999, outline: 'none', width: '100%', maxWidth: 360, boxSizing: 'border-box' } as CSSProperties,
  card: { border: `1.5px solid ${C.ink}`, borderRadius: 12, padding: 14 } as CSSProperties,
};

export const Btn = ({ children, onClick, primary, danger, disabled, testId }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; testId?: string }) => (
  <button
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    style={{
      fontFamily: F.semi,
      fontSize: 13,
      padding: '8px 14px',
      borderRadius: 999,
      border: `1.5px solid ${danger ? RED : C.ink}`,
      background: danger ? RED : primary ? C.ink : C.paper,
      color: danger || primary ? C.paper : C.ink,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      whiteSpace: 'nowrap',
    }}
  >
    {children}
  </button>
);
export const Err = ({ text }: { text: string | null }) => (text ? <p style={{ color: RED, margin: '8px 0' }}>{text}</p> : null);
export const Loading = () => <p style={s.mute}>Loading…</p>;
export const Pill = ({ children, color = SOFT }: { children: ReactNode; color?: string }) => (
  <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom', padding: '1px 8px', borderRadius: 999, background: color, border: `1px solid ${C.ink}`, fontSize: 12, fontFamily: F.semi, whiteSpace: 'nowrap', boxSizing: 'border-box' }}>{children}</span>
);
export const statusColor = (st: string) => (st === 'ok' || st === 'done' ? C.mint : st === 'error' || st === 'failed' ? C.tomato : C.lemon);

// true below the width where the side navigation and the docked simulator no longer fit next to the content
export const NARROW = 820;
export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < NARROW);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < NARROW);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}
