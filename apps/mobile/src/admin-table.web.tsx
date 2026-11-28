import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

import { LINE, SOFT, s } from './admin-ui.web';
import { C, F } from './theme';

// The one table of the admin console: sort by a column header, search box, per-column filters (select for a few
// distinct values, time range for dates), columns that share the container's width (long values are cut with a
// tooltip). Sorting and filtering run on the rows the page loaded.

export type Col<T> = {
  key: string;
  label: string;
  // the value to sort, filter and search by; ISO strings for dates
  get: (row: T) => string | number | null | undefined;
  // what the cell shows (default: the value)
  render?: (row: T) => ReactNode;
  num?: boolean;
  mono?: boolean;
  // share of the width (default 1) and the least width in px before the table scrolls sideways
  weight?: number;
  min?: number;
  filter?: 'select' | 'date';
};

type Sort = { key: string; dir: 1 | -1 } | null;
const RANGES: [string, number][] = [['Any time', 0], ['24 hours', 1], ['7 days', 7], ['30 days', 30]];

const ctl: CSSProperties = { fontFamily: F.text, fontSize: 13, padding: '6px 10px', border: `1.5px solid ${C.ink}`, borderRadius: 999, background: C.paper, outline: 'none', maxWidth: 200 };
const text = (v: string | number | null | undefined) => (v == null ? '' : String(v));

export function DataTable<T>({
  rows,
  cols,
  rowKey,
  onRow,
  onHover,
  testId,
  rowTestId,
  placeholder = 'Search',
  empty = 'Nothing here.',
}: {
  rows: T[];
  cols: Col<T>[];
  rowKey: (row: T, i: number) => string;
  onRow?: (row: T) => void;
  onHover?: (row: T) => void;
  testId?: string;
  rowTestId?: string;
  placeholder?: string;
  empty?: string;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  // values offered by the select filters
  const options = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const c of cols) if (c.filter === 'select') out[c.key] = Array.from(new Set(rows.map((r) => text(c.get(r))).filter(Boolean))).sort();
    return out;
  }, [rows, cols]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (needle && !cols.some((c) => text(c.get(r)).toLowerCase().includes(needle))) return false;
      for (const c of cols) {
        const want = picked[c.key];
        if (!want) continue;
        if (c.filter === 'select' && text(c.get(r)) !== want) return false;
        if (c.filter === 'date') {
          const t = Date.parse(text(c.get(r)));
          if (Number.isNaN(t) || t < Date.now() - Number(want) * 86400000) return false;
        }
      }
      return true;
    });
    if (sort) {
      const col = cols.find((c) => c.key === sort.key);
      if (col)
        out = [...out].sort((a, b) => {
          const x = col.get(a);
          const y = col.get(b);
          // empty values go last in both directions
          if (x == null || x === '') return y == null || y === '' ? 0 : 1;
          if (y == null || y === '') return -1;
          return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
        });
    }
    return out;
  }, [rows, cols, q, picked, sort]);

  const total = cols.reduce((a, c) => a + (c.weight ?? 1), 0);
  const minWidth = cols.reduce((a, c) => a + (c.min ?? 70), 0);
  const filtered = q.trim() !== '' || Object.values(picked).some(Boolean);
  const clickSort = (key: string) => setSort((cur) => (cur?.key !== key ? { key, dir: 1 } : cur.dir === 1 ? { key, dir: -1 } : null));

  return (
    <div data-testid={testId ? `${testId}-box` : undefined}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 8px' }}>
        <input data-testid={testId ? `${testId}-search` : undefined} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} style={{ ...ctl, width: 180 }} />
        {cols.map((c) =>
          c.filter === 'select' ? (
            <select key={c.key} data-testid={testId ? `${testId}-filter-${c.key}` : undefined} aria-label={c.label} value={picked[c.key] ?? ''} onChange={(e) => setPicked({ ...picked, [c.key]: e.target.value })} style={ctl}>
              <option value="">{c.label}: all</option>
              {options[c.key].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : c.filter === 'date' ? (
            <select key={c.key} data-testid={testId ? `${testId}-filter-${c.key}` : undefined} aria-label={c.label} value={picked[c.key] ?? ''} onChange={(e) => setPicked({ ...picked, [c.key]: e.target.value })} style={ctl}>
              {RANGES.map(([label, days]) => <option key={label} value={days ? String(days) : ''}>{c.label}: {label.toLowerCase()}</option>)}
            </select>
          ) : null,
        )}
        <span data-testid={testId ? `${testId}-count` : undefined} style={{ ...s.mute, fontSize: 12 }}>
          {filtered ? `${shown.length} of ${rows.length}` : rows.length} {rows.length === 1 ? 'row' : 'rows'}
        </span>
        {filtered && (
          <button onClick={() => { setQ(''); setPicked({}); }} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: F.semi, fontSize: 12, color: C.mute, textDecoration: 'underline' }}>
            Clear
          </button>
        )}
      </div>
      <div style={{ overflowX: 'auto', border: `1.5px solid ${C.ink}`, borderRadius: 12 }}>
        <table data-testid={testId} style={{ borderCollapse: 'collapse', width: '100%', minWidth, tableLayout: 'fixed' }}>
          <colgroup>
            {cols.map((c) => <col key={c.key} style={{ width: `${((c.weight ?? 1) / total) * 100}%` }} />)}
          </colgroup>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    data-testid={testId ? `${testId}-th-${c.key}` : undefined}
                    aria-sort={on ? (sort!.dir === 1 ? 'ascending' : 'descending') : 'none'}
                    onClick={() => clickSort(c.key)}
                    title={`Sort by ${c.label}`}
                    style={{ textAlign: c.num ? 'right' : 'left', fontFamily: F.semi, fontSize: 12, color: on ? C.ink : C.mute, padding: '8px 10px', borderBottom: `1.5px solid ${C.ink}`, background: SOFT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', userSelect: 'none' }}
                  >
                    {c.label}
                    <span style={{ display: 'inline-block', width: 12 }}>{on ? (sort!.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={rowKey(r, i)} data-testid={rowTestId} onClick={onRow ? () => onRow(r) : undefined} onMouseEnter={onHover ? () => onHover(r) : undefined} style={{ cursor: onRow ? 'pointer' : undefined }}>
                {cols.map((c) => {
                  const v = text(c.get(r));
                  return (
                    <td
                      key={c.key}
                      title={v}
                      style={{ padding: '7px 10px', borderBottom: `1px solid ${LINE}`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: c.num ? 'right' : 'left', ...(c.num || c.mono ? s.mono : null) }}
                    >
                      {c.render ? c.render(r) : v || '–'}
                    </td>
                  );
                })}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={cols.length} style={{ padding: 12, color: C.mute }}>{rows.length === 0 ? empty : 'No rows match.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
