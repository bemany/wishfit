import { useEffect, useReducer } from 'react';

import { call } from './api';
import { errText } from './admin-ui.web';

// Stale-while-revalidate cache for the admin console's GETs: a page asks for its path, gets what is cached at once
// and a fresh copy replaces it in the background. Held in memory only, gone with the tab (and cleared on sign-in).

const FRESH_MS = 4000;
const cache = new Map<string, { data: unknown; at: number }>();
const errors = new Map<string, string>();
const inflight = new Map<string, Promise<void>>();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

// Page size the overviews load: the tables sort and filter on these rows (the API caps users and results at 200)
export const USERS_LIMIT = 200;
export const RESULTS_LIMIT = 200;
export const AUDIT_LIMIT = 500;
export const usersPath = (query: string, offset: number) => `/admin/users?query=${encodeURIComponent(query)}&limit=${USERS_LIMIT}&offset=${offset}`;
export const RESULTS_PATH = `/admin/results?limit=${RESULTS_LIMIT}`;
export const ACQUISITION_PATH = '/admin/acquisition';
export const COSTS_PATH = '/admin/costs?days=30';
export const AUDIT_PATH = `/admin/audit?limit=${AUDIT_LIMIT}`;

export function load(path: string, force = false): Promise<void> {
  const running = inflight.get(path);
  if (running) return running;
  const hit = cache.get(path);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve();
  const p = call<unknown>('GET', path)
    .then((data) => {
      cache.set(path, { data, at: Date.now() });
      errors.delete(path);
    })
    .catch((e) => {
      errors.set(path, errText(e));
    })
    .finally(() => {
      inflight.delete(path);
      notify();
    });
  inflight.set(path, p);
  return p;
}

// Warms a path on hover: only the row the pointer rests on for 150 ms, and at most 3 such loads at a time
const HOVER_MS = 150;
const HOVER_MAX = 3;
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let hoverActive = 0;
export const prefetch = (path: string) => {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    if (hoverActive >= HOVER_MAX || inflight.has(path)) return;
    hoverActive++;
    void load(path).finally(() => hoverActive--);
  }, HOVER_MS);
};

export const preloadOverviews = () => {
  for (const p of [usersPath('', 0), RESULTS_PATH, ACQUISITION_PATH, COSTS_PATH, AUDIT_PATH]) void load(p);
};

// After something changed on the server (End view, test push, daily check): reload what is cached under these
// path prefixes; pages keep showing the old copy until the new one is there
export const refreshCached = (prefixes: string[]) => {
  for (const key of Array.from(cache.keys())) if (prefixes.some((p) => key.startsWith(p))) void load(key, true);
};

export const clearCache = () => {
  cache.clear();
  errors.clear();
  inflight.clear();
  clearTimeout(hoverTimer);
};

export function useGet<T>(path: string | null) {
  const [, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    if (!path) return;
    subs.add(bump);
    void load(path);
    return () => {
      subs.delete(bump);
    };
  }, [path]);
  const hit = path ? cache.get(path) : undefined;
  return {
    data: (hit ? (hit.data as T) : null) as T | null,
    // an error only counts while there is nothing to show; a failed refresh keeps the cached copy
    error: path && !hit ? (errors.get(path) ?? null) : null,
    refreshing: path ? inflight.has(path) : false,
    reload: () => path && void load(path, true),
  };
}
