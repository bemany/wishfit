import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { useAccount } from './account';
import { SignIn } from './account-ui';
import { API_URL, ApiError, call, getSession, loadMe, loadPeople, saveMe, savePeople, type Me, type Person } from './api';
import { getLanguage, setLanguage, type Lang } from './i18n';
import { clearImpersonation } from './impersonation';
import { C, F } from './theme';

// The admin console at /admin, web only; see openspec/changes/admin-console (design.md, API contract in section 1).
// Plain DOM (tables, iframe) in the Wishfit look, denser than the app. The admin signs in like any user; the
// console itself never writes to the app's storage, the simulator keeps its own area in sessionStorage.

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  language?: string | null;
  people: number;
  wishes: number;
  devices: number;
  results: number;
  last_seen_at?: string | null;
  profile_slug?: string | null;
  source?: string | null;
  referred_by_email?: string | null;
  referrals?: number;
};
type Device = { token_tail: string; platform: string; created_at: string; last_ok_at?: string | null };
type ResultRow = { id: string; created_at: string; user_id?: string; email?: string; status: string; model?: string | null; duration_ms?: number | null; error?: string | null };
type UserDetail = { user: UserRow & { signup_source?: Record<string, string> | null }; data: { people?: unknown; profile?: unknown; updated_at?: string | null } | null; devices: Device[]; results: ResultRow[] };
type Audit = { at: string; admin_email: string; action: string; target_user_id?: string | null; detail?: unknown };
type Acquisition = { by_source: { source: string; medium?: string | null; campaign?: string | null; users: number }[]; top_referrers: { user_id: string; email: string; referrals: number }[] };
type Sim = { token: string; user: { id: string; email: string; language?: string | null }; expires_at: string };

type Tab = 'users' | 'results' | 'acquisition' | 'tools' | 'audit';
type Page = { tab: Tab; userId?: string; resultId?: string };

const RED = '#d92d20';
const LINE = '#e6e6e9';
const SOFT = '#f6f6f7';

const when = (iso?: string | null) => {
  if (!iso) return '–';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' });
};
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// One GET with loading and error state; reload() asks again
function useGet<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setError(null);
    call<T>('GET', path)
      .then((r) => live && setData(r))
      .catch((e) => live && setError(errText(e)));
    return () => {
      live = false;
    };
  }, [path, n]);
  return { data, error, reload: () => setN((x) => x + 1) };
}

const s = {
  page: { height: '100vh', overflow: 'auto', background: C.paper, color: C.ink, fontFamily: F.text, fontSize: 14 } as CSSProperties,
  wrap: { maxWidth: 1280, margin: '0 auto', padding: '16px 16px 48px' } as CSSProperties,
  h1: { fontFamily: F.display, fontSize: 26, margin: 0, letterSpacing: -0.5 } as CSSProperties,
  h2: { fontFamily: F.display, fontSize: 20, margin: '20px 0 8px' } as CSSProperties,
  mono: { fontFamily: F.mono, fontSize: 12 } as CSSProperties,
  mute: { color: C.mute } as CSSProperties,
  tableBox: { overflowX: 'auto', border: `1.5px solid ${C.ink}`, borderRadius: 12 } as CSSProperties,
  table: { borderCollapse: 'collapse', width: '100%', minWidth: 720 } as CSSProperties,
  th: { textAlign: 'left', fontFamily: F.semi, fontSize: 12, color: C.mute, padding: '8px 10px', borderBottom: `1.5px solid ${C.ink}`, background: SOFT, whiteSpace: 'nowrap' } as CSSProperties,
  td: { padding: '7px 10px', borderBottom: `1px solid ${LINE}`, verticalAlign: 'top' } as CSSProperties,
  num: { padding: '7px 10px', borderBottom: `1px solid ${LINE}`, textAlign: 'right', fontFamily: F.mono, fontSize: 12 } as CSSProperties,
  input: { fontFamily: F.text, fontSize: 14, padding: '9px 12px', border: `1.5px solid ${C.ink}`, borderRadius: 999, outline: 'none', width: '100%', maxWidth: 360, boxSizing: 'border-box' } as CSSProperties,
  card: { border: `1.5px solid ${C.ink}`, borderRadius: 12, padding: 14 } as CSSProperties,
};

const Btn = ({ children, onClick, primary, danger, disabled, testId }: { children: ReactNode; onClick: () => void; primary?: boolean; danger?: boolean; disabled?: boolean; testId?: string }) => (
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
const Err = ({ text }: { text: string | null }) => (text ? <p style={{ color: RED, margin: '8px 0' }}>{text}</p> : null);
const Loading = () => <p style={s.mute}>Loading…</p>;
const Pill = ({ children, color = SOFT }: { children: ReactNode; color?: string }) => (
  <span style={{ display: 'inline-block', padding: '1px 8px', borderRadius: 999, background: color, border: `1px solid ${C.ink}`, fontSize: 12, fontFamily: F.semi, whiteSpace: 'nowrap' }}>{children}</span>
);
const statusColor = (st: string) => (st === 'ok' || st === 'done' ? C.mint : st === 'error' || st === 'failed' ? C.tomato : C.lemon);

function Table({ head, children, testId }: { head: string[]; children: ReactNode; testId?: string }) {
  return (
    <div style={s.tableBox}>
      <table data-testid={testId} style={s.table}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// A trace or any JSON, readable as a tree: objects and arrays fold open, the first `open` levels are open
function JsonTree({ value, name, depth = 0, open = 2 }: { value: unknown; name?: string; depth?: number; open?: number }) {
  const label = name !== undefined ? <span style={{ fontFamily: F.semi }}>{name}: </span> : null;
  if (value === null || typeof value !== 'object') {
    const color = typeof value === 'string' ? '#1a7f37' : typeof value === 'number' ? '#0b5cad' : C.mute;
    return (
      <div style={{ ...s.mono, paddingLeft: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {label}
        <span style={{ color }}>{typeof value === 'string' ? JSON.stringify(value) : String(value)}</span>
      </div>
    );
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value as Record<string, unknown>);
  return (
    <details open={depth < open} style={{ ...s.mono, paddingLeft: depth ? 14 : 0 }}>
      <summary style={{ cursor: 'pointer' }}>
        {label}
        <span style={s.mute}>{Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}</span>
      </summary>
      {entries.map(([k, v]) => <JsonTree key={k} name={k} value={v} depth={depth + 1} open={open} />)}
    </details>
  );
}

const sourceOf = (u: UserRow) => u.source ?? (u.referred_by_email ? 'referral' : 'direct');

function Users({ open }: { open: (p: Page) => void }) {
  const [query, setQuery] = useState('');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(query.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);
  const { data, error } = useGet<{ users: UserRow[]; total: number }>(`/admin/users?query=${encodeURIComponent(q)}&limit=50&offset=${offset}`);
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <input data-testid="user-search" placeholder="Search e-mail" value={query} onChange={(e) => setQuery(e.target.value)} style={s.input} />
        {data && <span style={s.mute}>{data.total} users</span>}
      </div>
      <Err text={error} />
      {!data && !error ? (
        <Loading />
      ) : data ? (
        <Table testId="users" head={['E-mail', 'Created', 'Last seen', 'Source', 'Invited by', 'Brought', 'People', 'Wishes', 'Devices', 'Results']}>
          {data.users.map((u) => (
            <tr key={u.id} data-testid="user-row" onClick={() => open({ tab: 'users', userId: u.id })} style={{ cursor: 'pointer' }}>
              <td style={{ ...s.td, fontFamily: F.semi }}>{u.email}</td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{when(u.created_at)}</td>
              <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{when(u.last_seen_at)}</td>
              <td style={s.td}><Pill>{sourceOf(u)}</Pill></td>
              <td style={s.td}>{u.referred_by_email ?? <span style={s.mute}>–</span>}</td>
              <td style={s.num}>{u.referrals ?? 0}</td>
              <td style={s.num}>{u.people}</td>
              <td style={s.num}>{u.wishes}</td>
              <td style={s.num}>{u.devices}</td>
              <td style={s.num}>{u.results}</td>
            </tr>
          ))}
        </Table>
      ) : null}
      {data && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <Btn disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Previous</Btn>
          <Btn disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Next</Btn>
        </div>
      )}
    </>
  );
}

function ResultsTable({ rows, open, withUser }: { rows: ResultRow[]; open: (id: string) => void; withUser?: boolean }) {
  return (
    <Table testId="results" head={['Created', ...(withUser ? ['User'] : []), 'Status', 'Model', 'Duration', 'Error']}>
      {rows.map((r) => (
        <tr key={r.id} data-testid="result-row" onClick={() => open(r.id)} style={{ cursor: 'pointer' }}>
          <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{when(r.created_at)}</td>
          {withUser && <td style={s.td}>{r.email ?? r.user_id ?? '–'}</td>}
          <td style={s.td}><Pill color={statusColor(r.status)}>{r.status}</Pill></td>
          <td style={{ ...s.td, ...s.mono }}>{r.model ?? '–'}</td>
          <td style={s.num}>{r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)} s` : '–'}</td>
          <td style={{ ...s.td, color: RED, maxWidth: 320 }}>{r.error ?? ''}</td>
        </tr>
      ))}
    </Table>
  );
}

function UserDetailView({ id, open, simulate }: { id: string; open: (p: Page) => void; simulate: (sim: Sim) => void }) {
  const { data, error } = useGet<UserDetail>(`/admin/users/${encodeURIComponent(id)}`);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<'push' | 'imp' | null>(null);
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  const u = data.user;
  const people = Array.isArray(data.data?.people) ? (data.data!.people as { name?: string; wishes?: unknown[] }[]) : [];
  const push = () => {
    setBusy('push');
    setNote(null);
    call<{ sent: number; devices: number }>('POST', '/admin/push-test', { user_id: u.id })
      .then((r) => setNote(`Test push sent to ${r.sent} of ${r.devices} device${r.devices === 1 ? '' : 's'}.`))
      .catch((e) => setNote(errText(e)))
      .finally(() => setBusy(null));
  };
  const viewAs = () => {
    setBusy('imp');
    setNote(null);
    call<Sim>('POST', '/admin/impersonate', { user_id: u.id })
      .then(simulate)
      .catch((e) => setNote(errText(e)))
      .finally(() => setBusy(null));
  };
  const fields: [string, ReactNode][] = [
    ['ID', <span style={s.mono}>{u.id}</span>],
    ['Created', when(u.created_at)],
    ['Last seen', when(u.last_seen_at)],
    ['Language', u.language ?? '–'],
    ['Profile', u.profile_slug ? <span style={s.mono}>/u/{u.profile_slug}</span> : '–'],
    ['Source', <Pill>{sourceOf(u)}</Pill>],
    ['Invited by', u.referred_by_email ?? '–'],
    ['Brought', String(u.referrals ?? 0)],
  ];
  return (
    <div data-testid="user-detail">
      <button onClick={() => open({ tab: 'users' })} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontFamily: F.semi, color: C.mute }}>← Users</button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', margin: '8px 0 12px' }}>
        <h2 style={{ ...s.h2, margin: 0, flex: '1 1 auto', wordBreak: 'break-all' }}>{u.email}</h2>
        <Btn testId="push-test" disabled={busy !== null || data.devices.length === 0} onClick={push}>Test push</Btn>
        <Btn testId="view-as" primary disabled={busy !== null} onClick={viewAs}>View as user</Btn>
      </div>
      {note && <p data-testid="detail-note" style={{ ...s.card, background: SOFT, margin: '0 0 12px' }}>{note}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div style={s.card}>
          {fields.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
              <span style={{ ...s.mute, width: 92, flexShrink: 0 }}>{k}</span>
              <span style={{ wordBreak: 'break-all' }}>{v}</span>
            </div>
          ))}
          {u.signup_source && Object.keys(u.signup_source).length > 0 && (
            <div style={{ marginTop: 8 }}>
              <JsonTree name="signup_source" value={u.signup_source} />
            </div>
          )}
        </div>
        <div style={s.card}>
          <div style={{ fontFamily: F.semi, marginBottom: 6 }}>People ({people.length})</div>
          {people.length === 0 && <span style={s.mute}>None</span>}
          {people.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
              <span>{p.name || '–'}</span>
              <span style={{ ...s.mono, ...s.mute }}>{Array.isArray(p.wishes) ? p.wishes.length : 0} wishes</span>
            </div>
          ))}
          <div style={{ ...s.mute, marginTop: 6, fontSize: 12 }}>Data updated {when(data.data?.updated_at)}</div>
        </div>
      </div>
      <h2 style={s.h2}>Devices</h2>
      {data.devices.length === 0 ? (
        <p style={s.mute}>No devices.</p>
      ) : (
        <Table head={['Token', 'Platform', 'Added', 'Last delivered']}>
          {data.devices.map((d) => (
            <tr key={d.token_tail + d.created_at}>
              <td style={{ ...s.td, ...s.mono }}>…{d.token_tail}</td>
              <td style={s.td}>{d.platform}</td>
              <td style={s.td}>{when(d.created_at)}</td>
              <td style={s.td}>{when(d.last_ok_at)}</td>
            </tr>
          ))}
        </Table>
      )}
      <h2 style={s.h2}>Results</h2>
      {data.results.length === 0 ? <p style={s.mute}>No results.</p> : <ResultsTable rows={data.results} open={(rid) => open({ tab: 'results', resultId: rid })} />}
      <h2 style={s.h2}>Data</h2>
      <div style={{ ...s.card, overflowX: 'auto' }}>
        <JsonTree value={data.data ?? {}} />
      </div>
    </div>
  );
}

function Results({ open }: { open: (p: Page) => void }) {
  const { data, error } = useGet<{ results: ResultRow[] }>('/admin/results?limit=50');
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  return <ResultsTable withUser rows={data.results} open={(id) => open({ tab: 'results', resultId: id })} />;
}

function ResultView({ id, back }: { id: string; back: () => void }) {
  const { data, error } = useGet<{ response: unknown; trace: unknown }>(`/admin/results/${encodeURIComponent(id)}`);
  return (
    <div data-testid="result-detail">
      <button onClick={back} style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontFamily: F.semi, color: C.mute }}>← Back</button>
      <h2 style={s.h2}>
        Result <span style={s.mono}>{id}</span>
      </h2>
      <Err text={error} />
      {!data && !error && <Loading />}
      {data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 12 }}>
          <div style={{ ...s.card, overflowX: 'auto' }} data-testid="trace">
            <div style={{ fontFamily: F.semi, marginBottom: 6 }}>Trace</div>
            <JsonTree value={data.trace} open={4} />
          </div>
          <div style={{ ...s.card, overflowX: 'auto' }}>
            <div style={{ fontFamily: F.semi, marginBottom: 6 }}>Response</div>
            <JsonTree value={data.response} open={3} />
          </div>
        </div>
      )}
    </div>
  );
}

function AcquisitionView({ open }: { open: (p: Page) => void }) {
  const { data, error } = useGet<Acquisition>('/admin/acquisition');
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  return (
    <div data-testid="acquisition" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
      <div>
        <h2 style={{ ...s.h2, marginTop: 0 }}>By source</h2>
        <Table head={['Source', 'Medium', 'Campaign', 'Users']}>
          {data.by_source.map((r, i) => (
            <tr key={i}>
              <td style={s.td}><Pill>{r.source}</Pill></td>
              <td style={s.td}>{r.medium ?? '–'}</td>
              <td style={s.td}>{r.campaign ?? '–'}</td>
              <td style={s.num}>{r.users}</td>
            </tr>
          ))}
        </Table>
      </div>
      <div>
        <h2 style={{ ...s.h2, marginTop: 0 }}>Top inviters</h2>
        <Table head={['User', 'Brought']}>
          {data.top_referrers.map((r) => (
            <tr key={r.user_id} onClick={() => open({ tab: 'users', userId: r.user_id })} style={{ cursor: 'pointer' }}>
              <td style={s.td}>{r.email}</td>
              <td style={s.num}>{r.referrals}</td>
            </tr>
          ))}
        </Table>
      </div>
    </div>
  );
}

function Tools() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<unknown>(undefined);
  const [error, setError] = useState<string | null>(null);
  const run = () => {
    setBusy(true);
    setError(null);
    call('POST', '/admin/cron')
      .then(setOut)
      .catch((e) => setError(errText(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div style={{ ...s.card, maxWidth: 720 }}>
      <div style={{ fontFamily: F.semi }}>Daily check</div>
      <p style={{ ...s.mute, margin: '4px 0 10px' }}>Runs the price and birthday check (the 07:00 cron) right now, for every user.</p>
      <Btn testId="run-cron" primary disabled={busy} onClick={run}>{busy ? 'Running…' : 'Run now'}</Btn>
      <Err text={error} />
      {out !== undefined && (
        <div data-testid="cron-result" style={{ marginTop: 12 }}>
          <JsonTree value={out} />
        </div>
      )}
    </div>
  );
}

function AuditView() {
  const { data, error } = useGet<{ entries: Audit[] }>('/admin/audit?limit=100');
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  return (
    <Table testId="audit" head={['When', 'Admin', 'Action', 'User', 'Detail']}>
      {data.entries.map((a, i) => (
        <tr key={i}>
          <td style={{ ...s.td, whiteSpace: 'nowrap' }}>{when(a.at)}</td>
          <td style={s.td}>{a.admin_email}</td>
          <td style={s.td}><Pill>{a.action}</Pill></td>
          <td style={{ ...s.td, ...s.mono }}>{a.target_user_id ?? '–'}</td>
          <td style={{ ...s.td, ...s.mono, maxWidth: 380, wordBreak: 'break-word' }}>{a.detail == null ? '' : JSON.stringify(a.detail)}</td>
        </tr>
      ))}
    </Table>
  );
}

// The user's app in an iPhone frame. The token goes in the fragment (never sent to a server, removed by the
// app at once); the app inside keeps its data in sessionStorage under wishfit:imp:<userId>:
function Simulator({ sim, close }: { sim: Sim; close: () => void }) {
  const [fit, setFit] = useState(1);
  const [expired, setExpired] = useState(false);
  const released = useRef(false);
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
    const onResize = () => setFit(Math.min(1, (window.innerHeight - 110) / 868, (window.innerWidth - 24) / 414));
    onResize();
    window.addEventListener('message', onMessage);
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', release);
    };
  }, [end, release]);
  useEffect(() => release, [release]);
  const hash = new URLSearchParams({ t: sim.token, u: sim.user.id, e: sim.user.email, l: sim.user.language === 'de' ? 'de' : 'en' });
  return (
    <div data-testid="simulator" style={{ position: 'fixed', inset: 0, background: 'rgba(11,11,12,0.72)', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: C.paper, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontFamily: F.semi }}>Viewing as {sim.user.email}</span>
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
        <div style={{ width: 414 * fit, height: 868 * fit }}>
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

// Signing in to the console is the app's own sign-in (same session, same rule for the device's data)
function AdminSignIn({ onDone }: { onDone: () => void }) {
  const [people, setPeople] = useState<Person[]>(loadPeople);
  const [me, setMe] = useState<Me>(loadMe);
  const peopleRef = useRef(people);
  const [lang, setLang] = useState<Lang>(getLanguage);
  const applyPeople = (f: (all: Person[]) => Person[]) => {
    const next = f(peopleRef.current);
    peopleRef.current = next;
    savePeople(next);
    setPeople(next);
  };
  const adopt = (next: Lang) => {
    setLanguage(next);
    setLang(next);
  };
  const account = useAccount(people, me, applyPeople, (m) => { saveMe(m); setMe(m); }, peopleRef, adopt);
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <SignIn account={account} lang={lang} onLanguage={adopt} onDone={onDone} />
    </div>
  );
}

const TABS: [Tab, string][] = [
  ['users', 'Users'],
  ['results', 'Results'],
  ['acquisition', 'Acquisition'],
  ['tools', 'Tools'],
  ['audit', 'Audit'],
];

export function AdminConsole() {
  const [state, setState] = useState<'check' | 'signin' | 'denied' | 'ok' | 'error'>(() => (getSession() ? 'check' : 'signin'));
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [page, setPage] = useState<Page>({ tab: 'users' });
  const [sim, setSim] = useState<Sim | null>(null);

  useEffect(() => {
    document.title = 'Wishfit Admin';
    // a view left over from before a reload in this tab: its data goes, the session expires on the server
    try {
      for (const key of Object.keys(sessionStorage)) if (key.startsWith('wishfit:imp:')) sessionStorage.removeItem(key);
    } catch {
      // no sessionStorage
    }
  }, []);
  useEffect(() => {
    if (state !== 'check') return;
    call<{ email: string }>('GET', '/admin/me')
      .then((r) => {
        setEmail(r.email);
        setState('ok');
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return setState('signin');
        if (e instanceof ApiError && e.status === 403) return setState('denied');
        setProblem(errText(e));
        setState('error');
      });
  }, [state]);

  if (state === 'signin') return <AdminSignIn onDone={() => setState('check')} />;
  if (state === 'check') return <div style={s.page}><div style={s.wrap}><Loading /></div></div>;
  if (state !== 'ok')
    return (
      <div style={s.page}>
        <div data-testid="admin-denied" style={{ ...s.wrap, maxWidth: 520, paddingTop: 80 }}>
          <h1 style={s.h1}>{state === 'denied' ? 'No access' : 'Something went wrong'}</h1>
          <p style={s.mute}>{state === 'denied' ? `${getSession()?.email ?? 'This account'} is not an admin.` : problem}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn primary onClick={() => window.location.assign('/')}>Open Wishfit</Btn>
            {state === 'error' && <Btn onClick={() => setState('check')}>Try again</Btn>}
          </div>
        </div>
      </div>
    );

  return (
    <div style={s.page} data-testid="admin-console">
      <div style={{ borderBottom: `1.5px solid ${C.ink}`, position: 'sticky', top: 0, background: C.paper, zIndex: 2 }}>
        <div style={{ ...s.wrap, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={s.h1}>
            wishfit<span style={{ color: C.tomato }}>.</span> <span style={{ fontFamily: F.mono, fontSize: 13, color: C.mute, letterSpacing: 0 }}>admin</span>
          </h1>
          <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: '1 1 auto' }}>
            {TABS.map(([tab, label]) => {
              const on = page.tab === tab && !page.userId && !page.resultId;
              return (
                <button
                  key={tab}
                  data-testid={`tab-${tab}`}
                  onClick={() => setPage({ tab })}
                  style={{ fontFamily: F.semi, fontSize: 13, padding: '6px 12px', borderRadius: 999, border: `1.5px solid ${C.ink}`, background: page.tab === tab ? C.lemon : C.paper, cursor: 'pointer', fontWeight: on ? 700 : 400 }}
                >
                  {label}
                </button>
              );
            })}
          </nav>
          <span style={{ ...s.mono, ...s.mute }}>{email}</span>
        </div>
      </div>
      <div style={s.wrap}>
        {page.resultId ? (
          <ResultView id={page.resultId} back={() => setPage(page.userId ? { tab: 'users', userId: page.userId } : { tab: page.tab })} />
        ) : page.userId ? (
          <UserDetailView id={page.userId} simulate={setSim} open={(p) => setPage(p.resultId ? { ...p, userId: page.userId } : p)} />
        ) : page.tab === 'users' ? (
          <Users open={setPage} />
        ) : page.tab === 'results' ? (
          <Results open={setPage} />
        ) : page.tab === 'acquisition' ? (
          <AcquisitionView open={setPage} />
        ) : page.tab === 'tools' ? (
          <Tools />
        ) : (
          <AuditView />
        )}
      </div>
      {sim && <Simulator sim={sim} close={() => setSim(null)} />}
    </div>
  );
}
