import { useEffect, useRef, useState, type ReactNode } from 'react';

import { useAccount } from './account';
import { SignIn } from './account-ui';
import { ApiError, call, getSession, loadMe, loadPeople, saveMe, savePeople, type Me, type Person } from './api';
import { ACQUISITION_PATH, AUDIT_PATH, COSTS_PATH, RESULTS_PATH, USERS_LIMIT, clearCache, prefetch, preloadOverviews, refreshCached, useGet, usersPath } from './admin-data.web';
import { Simulator, loadSimWidth, saveSimWidth, type Sim } from './admin-sim.web';
import { DataTable, type Col } from './admin-table.web';
import { Btn, Err, Loading, Pill, RED, SOFT, errText, s, statusColor, useNarrow, when } from './admin-ui.web';
import { getLanguage, setLanguage, type Lang } from './i18n';
import { C, F } from './theme';

// The admin console at /admin, web only; see openspec/changes/admin-console (design.md, API contract in section 1)
// and admin-ux (side navigation, tables, docked simulator, preloading).
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
type Tab = 'users' | 'results' | 'acquisition' | 'costs' | 'tools' | 'audit';
type Page = { tab: Tab; userId?: string; resultId?: string };


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
const dash = <span style={s.mute}>–</span>;

const userCols: Col<UserRow>[] = [
  { key: 'email', label: 'E-mail', get: (u) => u.email, weight: 2.6, min: 150, render: (u) => <span style={{ fontFamily: F.semi }}>{u.email}</span> },
  { key: 'created', label: 'Created', get: (u) => u.created_at, weight: 1.4, min: 105, filter: 'date', render: (u) => when(u.created_at) },
  { key: 'seen', label: 'Last seen', get: (u) => u.last_seen_at, weight: 1.4, min: 105, filter: 'date', render: (u) => when(u.last_seen_at) },
  { key: 'source', label: 'Source', get: sourceOf, weight: 1.1, min: 80, filter: 'select', render: (u) => <Pill>{sourceOf(u)}</Pill> },
  { key: 'invited', label: 'Invited by', get: (u) => u.referred_by_email, weight: 2, min: 110, render: (u) => u.referred_by_email ?? dash },
  { key: 'brought', label: 'Brought', get: (u) => u.referrals ?? 0, num: true, min: 62 },
  { key: 'people', label: 'People', get: (u) => u.people, num: true, min: 58 },
  { key: 'wishes', label: 'Wishes', get: (u) => u.wishes, num: true, min: 58 },
  { key: 'devices', label: 'Devices', get: (u) => u.devices, num: true, min: 60 },
  { key: 'results', label: 'Results', get: (u) => u.results, num: true, min: 60 },
];

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
  const { data, error } = useGet<{ users: UserRow[]; total: number }>(usersPath(q, offset));
  return (
    <>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        <input data-testid="user-search" placeholder="Search e-mail on the server" value={query} onChange={(e) => setQuery(e.target.value)} style={s.input} />
        {data && <span style={s.mute}>{data.total} users</span>}
      </div>
      <Err text={error} />
      {!data && !error ? (
        <Loading />
      ) : data ? (
        <DataTable
          testId="users"
          rowTestId="user-row"
          rows={data.users}
          cols={userCols}
          rowKey={(u) => u.id}
          onRow={(u) => open({ tab: 'users', userId: u.id })}
          onHover={(u) => prefetch(`/admin/users/${encodeURIComponent(u.id)}`)}
          placeholder="Filter this list"
        />
      ) : null}
      {data && data.total > USERS_LIMIT && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <Btn disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - USERS_LIMIT))}>Previous</Btn>
          <Btn disabled={offset + USERS_LIMIT >= data.total} onClick={() => setOffset(offset + USERS_LIMIT)}>Next</Btn>
          <span style={{ ...s.mute, fontSize: 12 }}>Sorting and filters apply to this page of {USERS_LIMIT}.</span>
        </div>
      )}
    </>
  );
}

function ResultsTable({ rows, open, withUser }: { rows: ResultRow[]; open: (id: string) => void; withUser?: boolean }) {
  const cols: Col<ResultRow>[] = [
    { key: 'created', label: 'Created', get: (r) => r.created_at, weight: 1.4, min: 105, filter: 'date', render: (r) => when(r.created_at) },
    ...(withUser ? [{ key: 'user', label: 'User', get: (r: ResultRow) => r.email ?? r.user_id, weight: 2.2, min: 120 }] : []),
    { key: 'status', label: 'Status', get: (r) => r.status, weight: 1.1, min: 80, filter: 'select', render: (r) => <Pill color={statusColor(r.status)}>{r.status}</Pill> },
    { key: 'model', label: 'Model', get: (r) => r.model, weight: 1.8, min: 100, mono: true, filter: 'select' },
    { key: 'duration', label: 'Duration', get: (r) => r.duration_ms, num: true, min: 72, render: (r) => (r.duration_ms != null ? `${(r.duration_ms / 1000).toFixed(1)} s` : '–') },
    { key: 'error', label: 'Error', get: (r) => r.error, weight: 3, min: 120, render: (r) => <span style={{ color: RED }}>{r.error ?? ''}</span> },
  ];
  return <DataTable testId="results" rowTestId="result-row" rows={rows} cols={cols} rowKey={(r) => r.id} onRow={(r) => open(r.id)} onHover={(r) => prefetch(`/admin/results/${encodeURIComponent(r.id)}`)} />;
}

const deviceCols: Col<Device>[] = [
  { key: 'token', label: 'Token', get: (d) => `…${d.token_tail}`, mono: true, min: 80 },
  { key: 'platform', label: 'Platform', get: (d) => d.platform, filter: 'select', min: 80 },
  { key: 'added', label: 'Added', get: (d) => d.created_at, filter: 'date', min: 105, weight: 1.4, render: (d) => when(d.created_at) },
  { key: 'ok', label: 'Last delivered', get: (d) => d.last_ok_at, min: 105, weight: 1.4, render: (d) => when(d.last_ok_at) },
];

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
      .then((r) => {
        setNote(`Test push sent to ${r.sent} of ${r.devices} device${r.devices === 1 ? '' : 's'}.`);
        refreshCached(['/admin/audit', `/admin/users/${encodeURIComponent(u.id)}`]);
      })
      .catch((e) => setNote(errText(e)))
      .finally(() => setBusy(null));
  };
  const viewAs = () => {
    setBusy('imp');
    setNote(null);
    call<Sim>('POST', '/admin/impersonate', { user_id: u.id })
      .then((r) => {
        simulate(r);
        refreshCached(['/admin/audit']);
      })
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
      {data.devices.length === 0 ? <p style={s.mute}>No devices.</p> : <DataTable testId="devices" rows={data.devices} cols={deviceCols} rowKey={(d) => d.token_tail + d.created_at} />}
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
  const { data, error } = useGet<{ results: ResultRow[] }>(RESULTS_PATH);
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


const sourceCols: Col<Acquisition['by_source'][number]>[] = [
  { key: 'source', label: 'Source', get: (r) => r.source, filter: 'select', min: 90, render: (r) => <Pill>{r.source}</Pill> },
  { key: 'medium', label: 'Medium', get: (r) => r.medium, min: 70 },
  { key: 'campaign', label: 'Campaign', get: (r) => r.campaign, min: 80 },
  { key: 'users', label: 'Users', get: (r) => r.users, num: true, min: 56, weight: 0.7 },
];
const inviterCols: Col<Acquisition['top_referrers'][number]>[] = [
  { key: 'email', label: 'User', get: (r) => r.email, weight: 3, min: 120 },
  { key: 'brought', label: 'Brought', get: (r) => r.referrals, num: true, min: 62, weight: 0.8 },
];

function AcquisitionView({ open }: { open: (p: Page) => void }) {
  const { data, error } = useGet<Acquisition>(ACQUISITION_PATH);
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  return (
    <div data-testid="acquisition" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ ...s.h2, marginTop: 0 }}>By source</h2>
        <DataTable testId="by-source" rows={data.by_source} cols={sourceCols} rowKey={(_, i) => String(i)} />
      </div>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ ...s.h2, marginTop: 0 }}>Top inviters</h2>
        <DataTable testId="inviters" rows={data.top_referrers} cols={inviterCols} rowKey={(r) => r.user_id} onRow={(r) => open({ tab: 'users', userId: r.user_id })} onHover={(r) => prefetch(`/admin/users/${encodeURIComponent(r.user_id)}`)} />
      </div>
    </div>
  );
}

type Costs = {
  daily: { day: string; source: string; usd: number; units: number }[];
  by_user: { user_id: string; email: string | null; usd: number }[];
  apify_accounts: { account: string; remaining_usd: number | null; used_usd: number | null; limit_usd: number | null; error?: string }[];
  totals: Record<'today' | '7d' | '30d', { usd: number; by_source: Record<string, number> }>;
};
const SOURCE_COLOR: Record<string, string> = { model: C.lemon, apify: '#b9e3ff', resend: '#ffc9d9', apns: '#d4f5c4' };
const usd = (n: number) => `${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })} $`;
const LOW_APIFY_USD = 1;

const costUserCols: Col<Costs['by_user'][number]>[] = [
  { key: 'user', label: 'User', get: (u) => u.email ?? u.user_id, weight: 3, min: 120 },
  { key: 'cost', label: 'Cost', get: (u) => u.usd, num: true, min: 80, render: (u) => usd(u.usd) },
];
const apifyCols: Col<Costs['apify_accounts'][number]>[] = [
  { key: 'account', label: 'Account', get: (a) => a.account, weight: 2, min: 90 },
  { key: 'used', label: 'Used', get: (a) => a.used_usd, num: true, min: 70, render: (a) => (a.used_usd == null ? '–' : usd(a.used_usd)) },
  { key: 'remaining', label: 'Remaining', get: (a) => a.remaining_usd, num: true, min: 80, render: (a) => (a.remaining_usd == null ? '–' : usd(a.remaining_usd)) },
  {
    key: 'note',
    label: 'Note',
    get: (a) => a.error ?? (a.remaining_usd != null && a.remaining_usd < LOW_APIFY_USD ? 'under 1 $, top up' : ''),
    weight: 2,
    min: 90,
    render: (a) => (a.error ? <Pill>{a.error}</Pill> : a.remaining_usd != null && a.remaining_usd < LOW_APIFY_USD ? <Pill>under 1 $, top up</Pill> : null),
  },
];

function CostsView({ open }: { open: (p: Page) => void }) {
  const { data, error } = useGet<Costs>(COSTS_PATH);
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  const days = Array.from(new Set(data.daily.map((d) => d.day))).slice(-30);
  const sources = Array.from(new Set(data.daily.map((d) => d.source)));
  const perDay = days.map((day) => ({ day, rows: data.daily.filter((d) => d.day === day) }));
  const max = Math.max(0.0001, ...perDay.map((p) => p.rows.reduce((a, r) => a + r.usd, 0)));
  return (
    <div data-testid="costs">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {([['today', 'Today'], ['7d', '7 days'], ['30d', '30 days']] as const).map(([k, label]) => (
          <div key={k} style={{ border: `1.5px solid ${C.ink}`, borderRadius: 12, padding: 12 }}>
            <div style={s.mute}>{label}</div>
            <div style={{ fontFamily: F.display, fontSize: 24 }}>{usd(data.totals[k].usd)}</div>
            <div style={{ ...s.mute, fontSize: 12 }}>{Object.entries(data.totals[k].by_source).map(([src, v]) => `${src} ${usd(v)}`).join(' · ') || '–'}</div>
          </div>
        ))}
      </div>
      <h2 style={s.h2}>Per day (UTC)</h2>
      {perDay.length === 0 ? <p style={s.mute}>No costs recorded yet.</p> : (
        <div data-testid="costs-bars" style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 140, border: `1.5px solid ${C.ink}`, borderRadius: 12, padding: '8px 8px 0' }}>
          {perDay.map(({ day, rows }) => (
            <div key={day} title={`${day}: ${usd(rows.reduce((a, r) => a + r.usd, 0))}`} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', height: '100%', justifyContent: 'flex-start' }}>
              {rows.map((r) => (
                <div key={r.source} style={{ height: `${(r.usd / max) * 100}%`, minHeight: r.usd > 0 ? 2 : 0, background: SOURCE_COLOR[r.source] ?? SOFT }} />
              ))}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
        {sources.map((src) => (
          <span key={src} style={{ fontSize: 12 }}><span style={{ display: 'inline-block', width: 10, height: 10, background: SOURCE_COLOR[src] ?? SOFT, border: `1px solid ${C.ink}`, marginRight: 4 }} />{src}</span>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.h2}>Per user (30 days)</h2>
          <DataTable testId="costs-users" rows={data.by_user} cols={costUserCols} rowKey={(u) => u.user_id} onRow={(u) => open({ tab: 'users', userId: u.user_id })} onHover={(u) => prefetch(`/admin/users/${encodeURIComponent(u.user_id)}`)} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={s.h2}>Apify accounts</h2>
          <DataTable testId="costs-apify" rows={data.apify_accounts} cols={apifyCols} rowKey={(a) => a.account} />
        </div>
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
      .then((r) => {
        setOut(r);
        refreshCached(['/admin/audit', '/admin/users', '/admin/results', '/admin/costs']);
      })
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

const auditCols: Col<Audit>[] = [
  { key: 'at', label: 'When', get: (a) => a.at, weight: 1.4, min: 105, filter: 'date', render: (a) => when(a.at) },
  { key: 'admin', label: 'Admin', get: (a) => a.admin_email, weight: 2, min: 110, filter: 'select' },
  { key: 'action', label: 'Action', get: (a) => a.action, weight: 1.6, min: 100, filter: 'select', render: (a) => <Pill>{a.action}</Pill> },
  { key: 'user', label: 'User', get: (a) => a.target_user_id, weight: 2, min: 100, mono: true },
  { key: 'detail', label: 'Detail', get: (a) => (a.detail == null ? '' : JSON.stringify(a.detail)), weight: 3, min: 120, mono: true },
];

function AuditView() {
  const { data, error } = useGet<{ entries: Audit[] }>(AUDIT_PATH);
  if (error) return <Err text={error} />;
  if (!data) return <Loading />;
  return <DataTable testId="audit" rows={data.entries} cols={auditCols} rowKey={(_, i) => String(i)} />;
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
  ['costs', 'Costs'],
  ['tools', 'Tools'],
  ['audit', 'Audit'],
];

function SideNav({ page, go, email }: { page: Page; go: (tab: Tab) => void; email: string }) {
  return (
    <nav data-testid="sidenav" style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 12, height: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ ...s.h1, fontSize: 22, padding: '4px 8px 12px' }}>
        wishfit<span style={{ color: C.tomato }}>.</span> <span style={{ fontFamily: F.mono, fontSize: 12, color: C.mute, letterSpacing: 0 }}>admin</span>
      </h1>
      {TABS.map(([tab, label]) => (
        <button
          key={tab}
          data-testid={`tab-${tab}`}
          aria-current={page.tab === tab ? 'page' : undefined}
          onClick={() => go(tab)}
          style={{ textAlign: 'left', fontFamily: F.semi, fontSize: 14, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${page.tab === tab ? C.ink : 'transparent'}`, background: page.tab === tab ? C.lemon : 'transparent', cursor: 'pointer', fontWeight: page.tab === tab && !page.userId && !page.resultId ? 700 : 400 }}
        >
          {label}
        </button>
      ))}
      <span style={{ ...s.mono, ...s.mute, marginTop: 'auto', padding: 8, wordBreak: 'break-all' }}>{email}</span>
    </nav>
  );
}

export function AdminConsole() {
  const [state, setState] = useState<'check' | 'signin' | 'denied' | 'ok' | 'error'>(() => (getSession() ? 'check' : 'signin'));
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [page, setPage] = useState<Page>({ tab: 'users' });
  const [sim, setSim] = useState<Sim | null>(null);
  const [simWidth, setSimWidth] = useState(loadSimWidth);
  const [menu, setMenu] = useState(false);
  const narrow = useNarrow();

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
    clearCache();
    call<{ email: string }>('GET', '/admin/me')
      .then((r) => {
        setEmail(r.email);
        setState('ok');
        // every overview in parallel, so a switch between areas finds its data waiting
        preloadOverviews();
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

  const go = (tab: Tab) => {
    setPage({ tab });
    setMenu(false);
  };
  // the end of a view is written to the audit log by the server a moment after the call
  const closeSim = () => {
    setSim(null);
    setTimeout(() => refreshCached(['/admin/audit', '/admin/users']), 500);
  };
  const changeWidth = (n: number) => {
    setSimWidth(n);
    saveSimWidth(n);
  };

  return (
    <div data-testid="admin-console" style={{ ...s.page, display: 'flex', overflow: 'hidden' }}>
      {!narrow && <aside style={{ width: 200, flexShrink: 0, borderRight: `1.5px solid ${C.ink}`, overflowY: 'auto' }}><SideNav page={page} go={go} email={email} /></aside>}
      {narrow && menu && (
        <div data-testid="drawer" style={{ position: 'fixed', inset: 0, zIndex: 20, display: 'flex' }}>
          <aside style={{ width: 240, maxWidth: '80vw', background: C.paper, borderRight: `1.5px solid ${C.ink}`, overflowY: 'auto' }}><SideNav page={page} go={go} email={email} /></aside>
          <div onClick={() => setMenu(false)} style={{ flex: 1, background: 'rgba(11,11,12,0.45)' }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', height: '100vh' }}>
        {narrow && (
          <div style={{ position: 'sticky', top: 0, zIndex: 2, background: C.paper, borderBottom: `1.5px solid ${C.ink}`, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
            <button data-testid="menu" aria-label="Menu" onClick={() => setMenu(true)} style={{ fontSize: 20, lineHeight: 1, padding: '4px 10px', borderRadius: 10, border: `1.5px solid ${C.ink}`, background: C.paper, cursor: 'pointer' }}>☰</button>
            <span style={{ fontFamily: F.semi }}>{TABS.find(([t]) => t === page.tab)?.[1]}</span>
          </div>
        )}
        <div style={{ ...s.wrap, maxWidth: 1400 }}>
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
          ) : page.tab === 'costs' ? (
            <CostsView open={setPage} />
          ) : page.tab === 'tools' ? (
            <Tools />
          ) : (
            <AuditView />
          )}
        </div>
      </div>
      {sim && <Simulator sim={sim} close={closeSim} docked={!narrow} width={simWidth} onWidth={changeWidth} />}
    </div>
  );
}
