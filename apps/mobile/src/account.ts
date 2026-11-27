import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, SESSION_KEY, call, getSession, saveMe, savePeople, setSessionLostHandler, type Me, type Person, type Session } from './api';
import { deleteSecret, writeSecret } from './storage';
import { TAG_COLORS } from './theme';

// Account and sync, see openspec/changes/accounts-and-web (design.md 2, 3, 8) and docs/api.md

type ServerData = { people: unknown[]; profile: unknown; updated_at: string | null };
type Local = { people: Person[]; me: Me };

const DEBOUNCE_MS = 1500;
const RETRY_MS = 15000;
const stamp = (x: { updatedAt?: number } | null | undefined) => x?.updatedAt ?? 0;

// Server data is trusted for its shape only up to what the app needs to render it
const toPerson = (p: any, i: number): Person | null =>
  p && typeof p === 'object' && typeof p.id === 'string' && typeof p.name === 'string'
    ? {
        id: p.id,
        name: p.name,
        occasion: typeof p.occasion === 'string' ? p.occasion : '',
        budget: typeof p.budget === 'number' ? p.budget : 0,
        color: typeof p.color === 'string' ? p.color : TAG_COLORS[i % TAG_COLORS.length],
        messages: Array.isArray(p.messages) ? p.messages : [],
        lastResultId: typeof p.lastResultId === 'string' ? p.lastResultId : null,
        pins: Array.isArray(p.pins) ? p.pins : [],
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
      }
    : null;
const toMe = (p: any): Me | null =>
  p && typeof p === 'object'
    ? {
        name: typeof p.name === 'string' ? p.name : '',
        color: typeof p.color === 'string' ? p.color : TAG_COLORS[1],
        wishes: Array.isArray(p.wishes) ? p.wishes.filter((w: unknown) => typeof w === 'string') : [],
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
      }
    : null;

// Merge by id, the newer updatedAt wins (missing = 0, a tie keeps the local one); local order first
export function mergePeople(local: Person[], server: Person[]): Person[] {
  const theirs = new Map(server.map((p) => [p.id, p]));
  const merged = local.map((p) => {
    const other = theirs.get(p.id);
    theirs.delete(p.id);
    return other && stamp(other) > stamp(p) ? other : p;
  });
  return [...merged, ...theirs.values()];
}
// My profile: the newer one wins; a tie keeps the local one, so an untouched empty profile never hides the account's
export function mergeMe(local: Me, server: Me | null): Me {
  return server && stamp(server) > stamp(local) ? server : local;
}

const hasProfile = (me: Me) => stamp(me) > 0 || me.name.trim() !== '' || me.wishes.length > 0;
const sameStamps = (a: { id?: string; updatedAt?: number }[], b: { id?: string; updatedAt?: number }[]) =>
  a.length === b.length && a.every((p, i) => p.id === b[i].id && stamp(p) === stamp(b[i]));
const sameContent = (a: Local, b: Local) => sameStamps(a.people, [...b.people].sort(byLocal(a.people))) && stamp(a.me) === stamp(b.me);
// Sort b like a, so a different order does not count as a change
const byLocal = (order: Person[]) => (x: Person, y: Person) => order.findIndex((p) => p.id === x.id) - order.findIndex((p) => p.id === y.id);
const keyOf = (l: Local) => JSON.stringify([l.people, hasProfile(l.me) ? l.me : null]);

export type Step = 'idle' | 'email' | 'code';
export type Account = {
  session: Session | null;
  syncing: boolean;
  syncError: string | null;
  // a code shown by the test backend instead of a mail
  devCode: string | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

export function explain(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.status === 401) return 'That code is wrong or has expired.';
  if (e.status === 422) return "That e-mail address doesn't look right.";
  if (e.status === 429) return 'Too many tries. Wait a minute and try again.';
  return e.message;
}

export function useAccount(people: Person[], me: Me, setPeople: (p: Person[]) => void, setMe: (m: Me) => void): Account {
  const [session, setSession] = useState<Session | null>(getSession);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);

  const latest = useRef<Local>({ people, me });
  latest.current = { people, me };
  const base = useRef<string | null>(null); // updated_at of the server's stored state
  const sent = useRef<string | null>(null); // what the account holds, as keyOf
  const ready = useRef(false); // the first pull of this session is done
  const queue = useRef<Promise<void>>(Promise.resolve());

  const reset = () => {
    base.current = null;
    sent.current = null;
    ready.current = false;
  };

  const applyLocal = (next: Local) => {
    latest.current = next;
    setPeople(next.people);
    setMe(next.me);
    savePeople(next.people);
    saveMe(next.me);
  };

  // pull: fetch the account first and merge; otherwise write the local state, merging only after a 409
  const reconcile = async (pull: boolean) => {
    let server: ServerData | null = pull ? await call<ServerData>('GET', '/me/data') : null;
    for (let attempt = 0; attempt < 4; attempt++) {
      let local = latest.current;
      if (server) {
        const theirs: Local = {
          people: server.people.map(toPerson).filter((p): p is Person => !!p),
          me: toMe(server.profile) ?? { name: '', color: TAG_COLORS[1], wishes: [] },
        };
        const merged: Local = { people: mergePeople(local.people, theirs.people), me: mergeMe(local.me, toMe(server.profile)) };
        if (keyOf(merged) !== keyOf(local)) applyLocal(merged);
        local = merged;
        base.current = server.updated_at;
        if (server.updated_at && sameContent(merged, theirs)) {
          sent.current = keyOf(merged);
          return;
        }
      }
      try {
        const r = await call<{ updated_at: string }>('PUT', '/me/data', { people: local.people, profile: hasProfile(local.me) ? local.me : null, base_updated_at: base.current });
        base.current = r.updated_at;
        sent.current = keyOf(local);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) server = (e as ApiError & { data?: ServerData }).data ?? null;
        else throw e;
        if (!server) throw e;
      }
    }
    throw new ApiError('The account changed while syncing. Try again.', 409);
  };

  const sync = useCallback((pull: boolean) => {
    const run = async () => {
      if (!getSession()) return;
      setSyncing(true);
      try {
        await reconcile(pull);
        ready.current = true;
        setSyncError(null);
      } catch (e) {
        if (getSession()) setSyncError(e instanceof ApiError && e.status === 413 ? 'Too much data to sync.' : e instanceof ApiError && e.status === 0 ? 'Offline, will sync later.' : 'Sync failed, will retry.');
      } finally {
        setSyncing(false);
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, []);

  const drop = useCallback(() => {
    deleteSecret(SESSION_KEY);
    reset();
    setSession(null);
    setSyncError(null);
    setDevCode(null);
  }, []);

  // a 401 on any call means the token is gone
  useEffect(() => {
    setSessionLostHandler(drop);
  }, [drop]);

  // app start: pull the account once
  useEffect(() => {
    if (getSession()) sync(true);
  }, []);

  // every change goes to the account after a pause
  useEffect(() => {
    if (!session || !ready.current) return;
    if (keyOf({ people, me }) === sent.current) return;
    const t = setTimeout(() => sync(false), syncError ? RETRY_MS : DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [people, me, session, syncError, syncing]);

  const requestCode = async (email: string) => {
    const r = await call<{ dev_code?: string } | undefined>('POST', '/auth/request-code', { email: email.trim().toLowerCase(), language: 'en' }, false);
    setDevCode(r?.dev_code ?? null);
  };
  const verify = async (email: string, code: string) => {
    const r = await call<{ token: string; user: { email: string } }>('POST', '/auth/verify', { email: email.trim().toLowerCase(), code: code.trim() }, false);
    const next: Session = { token: r.token, email: r.user.email };
    writeSecret(SESSION_KEY, JSON.stringify(next));
    reset();
    setSession(next);
    setDevCode(null);
    sync(true);
  };
  const signOut = async () => {
    await call('POST', '/auth/logout').catch(() => {});
    drop();
  };
  const deleteAccount = async () => {
    await call('DELETE', '/me');
    // the data stays on this device
    drop();
  };

  return { session, syncing, syncError, devCode, requestCode, verify, signOut, deleteAccount };
}
