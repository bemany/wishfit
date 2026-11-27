import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, call, clearSession, dateField, getSession, saveMe, savePeople, setSession, setSessionLostHandler, friendFields, newerPrices, toShare, toWishes, type Me, type Person, type Session } from './api';
import { getLanguage, isLang, t, type Lang } from './i18n';
import { registerPush, unregisterPush } from './push';
import { readJson, writeJson } from './storage';
import { TAG_COLORS } from './theme';

// Account and sync, see openspec/changes/accounts-and-web (design.md 2, 3, 8) and docs/api.md

type ServerData = { people: unknown[]; profile: unknown; updated_at: string | null };
type Local = { people: Person[]; me: Me; tombs: Tomb[] };

const DEBOUNCE_MS = 1500;
const RETRY_BASE_MS = 15000;
const RETRY_MAX_MS = 300000;
const FOREGROUND_PULL_MS = 60000;
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
        ...friendFields(p),
        ...dateField(p),
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
      }
    : null;
const toMe = (p: any): Me | null =>
  p && typeof p === 'object'
    ? {
        name: typeof p.name === 'string' ? p.name : '',
        color: typeof p.color === 'string' ? p.color : TAG_COLORS[1],
        wishes: toWishes(p.wishes),
        share: toShare(p.share),
        ...(isLang(p.language) ? { language: p.language } : {}),
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : undefined,
      }
    : null;

// A deleted person travels in the same list as {id, deleted: true, updatedAt}
export type Tomb = { id: string; updatedAt: number };
const TOMB_TTL_MS = 30 * 24 * 3600 * 1000;
const toTomb = (p: any): Tomb | null =>
  p && typeof p === 'object' && p.deleted === true && typeof p.id === 'string' ? { id: p.id, updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : 0 } : null;

// Merge by id, the newer updatedAt wins (missing = 0, a tie keeps the local one); local order first
export function mergePeople(local: Person[], server: Person[]): Person[] {
  const theirs = new Map(server.map((p) => [p.id, p]));
  const merged = local.map((p) => {
    const other = theirs.get(p.id);
    theirs.delete(p.id);
    const win = other && stamp(other) > stamp(p) ? other : p;
    const lose = win === p ? other : p;
    return win.wishes && lose?.wishes ? { ...win, wishes: newerPrices(win.wishes, lose.wishes) } : win;
  });
  return [...merged, ...theirs.values()];
}
// Deletions: the newest tombstone per id; a person edited after it comes back, otherwise it stays gone. Old tombstones fall away
export function applyTombs(people: Person[], a: Tomb[], b: Tomb[], now = Date.now()): { people: Person[]; tombs: Tomb[] } {
  const newest = new Map<string, number>();
  for (const t of [...a, ...b]) newest.set(t.id, Math.max(newest.get(t.id) ?? -1, t.updatedAt));
  const kept = people.filter((p) => !((newest.get(p.id) ?? -1) >= stamp(p)));
  const tombs = [...newest].filter(([, at]) => now - at < TOMB_TTL_MS).map(([id, updatedAt]) => ({ id, updatedAt }));
  return { people: kept, tombs: tombs.filter((t) => !kept.some((p) => p.id === t.id)) };
}
// My profile: the newer one wins; a tie keeps the local one, so an untouched empty profile never hides the account's
export function mergeMe(local: Me, server: Me | null): Me {
  if (!server) return local;
  const [win, lose] = stamp(server) > stamp(local) ? [server, local] : [local, server];
  return { ...win, wishes: newerPrices(win.wishes, lose.wishes) };
}

const hasProfile = (me: Me) => stamp(me) > 0 || me.name.trim() !== '' || me.wishes.length > 0;
// What the account holds in terms of ids and change times, independent of order
const sig = (l: Local) =>
  JSON.stringify([
    l.people.map((p) => [p.id, stamp(p)]).sort(),
    l.tombs.map((t) => [t.id, t.updatedAt]).sort(),
    stamp(l.me),
  ]);
const keyOf = (l: Local) => JSON.stringify([l.people, l.tombs, hasProfile(l.me) ? l.me : null]);
const payload = (l: Local) => [...l.people, ...l.tombs.map((t) => ({ id: t.id, deleted: true, updatedAt: t.updatedAt }))];

export type Step = 'idle' | 'email' | 'code';
export type Account = {
  session: Session | null;
  syncing: boolean;
  syncError: string | null;
  // the sign-in could not be stored; it lasts until the app restarts
  notStored: boolean;
  removePerson: (id: string) => void;
  // a code shown by the test backend instead of a mail
  devCode: string | null;
  requestCode: (email: string) => Promise<void>;
  verify: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  // tells the account the app language, for push texts; does nothing when signed out
  saveLanguage: (lang: Lang) => void;
};

export function explain(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.status === 401) return t('codeWrong');
  if (e.status === 422) return t('badEmail');
  if (e.status === 429) return t('tooManyTries');
  return e.message;
}

const loadTombs = (): Tomb[] => {
  const raw = readJson('tombstones');
  return (Array.isArray(raw) ? raw.map(toTomb) : []).filter((t): t is Tomb => !!t);
};

// applyPeople changes the people synchronously through a ref in App, so parallel updates never overwrite each other
export function useAccount(people: Person[], me: Me, applyPeople: (f: (all: Person[]) => Person[]) => void, setMe: (m: Me) => void, peopleRef: { current: Person[] }): Account {
  const [session, setSessionState] = useState<Session | null>(getSession);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notStored, setNotStored] = useState(false);
  const [tombs, setTombsState] = useState<Tomb[]>(loadTombs);

  const tombsRef = useRef(tombs);
  const meRef = useRef(me);
  meRef.current = me;
  const current = (): Local => ({ people: peopleRef.current, me: meRef.current, tombs: tombsRef.current });
  const setTombs = (t: Tomb[]) => {
    tombsRef.current = t;
    setTombsState(t);
    writeJson('tombstones', t);
  };

  const base = useRef<string | null>(null); // updated_at of the server's stored state
  const sent = useRef<string | null>(null); // what the account holds, as keyOf
  const ready = useRef(false); // the first pull of this session is done
  const failures = useRef(0);
  const pausedKey = useRef<string | null>(null); // state the server refused as too large
  const lastPull = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const reset = () => {
    base.current = null;
    sent.current = null;
    ready.current = false;
    failures.current = 0;
    pausedKey.current = null;
  };

  const applyLocal = (next: Local) => {
    applyPeople(() => next.people);
    savePeople(next.people);
    meRef.current = next.me;
    setMe(next.me);
    saveMe(next.me);
    setTombs(next.tombs);
  };

  // pull: fetch the account first and merge; otherwise write the local state, merging only after a 409
  const reconcile = async (pull: boolean) => {
    let server: ServerData | null = pull ? await call<ServerData>('GET', '/me/data') : null;
    if (pull) lastPull.current = Date.now();
    for (let attempt = 0; attempt < 4; attempt++) {
      let local = current();
      if (server) {
        const entries = server.people;
        const theirs: Local = {
          people: entries.map(toPerson).filter((p): p is Person => !!p),
          me: toMe(server.profile) ?? { name: '', color: TAG_COLORS[1], wishes: [] },
          tombs: entries.map(toTomb).filter((t): t is Tomb => !!t),
        };
        const joined = applyTombs(mergePeople(local.people, theirs.people), local.tombs, theirs.tombs);
        const merged: Local = { people: joined.people, tombs: joined.tombs, me: mergeMe(local.me, toMe(server.profile)) };
        if (keyOf(merged) !== keyOf(local)) applyLocal(merged);
        local = merged;
        base.current = server.updated_at;
        if (server.updated_at && sig(merged) === sig({ ...applyTombs(theirs.people, theirs.tombs, []), me: theirs.me })) {
          sent.current = keyOf(merged);
          return;
        }
      }
      try {
        const r = await call<{ updated_at: string }>('PUT', '/me/data', { people: payload(local), profile: hasProfile(local.me) ? local.me : null, base_updated_at: base.current });
        base.current = r.updated_at;
        sent.current = keyOf(local);
        return;
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) server = (e as ApiError & { data?: ServerData }).data ?? null;
        else throw e;
        if (!server) throw e;
      }
    }
    throw new ApiError(t('syncChanged'), 409);
  };

  const sync = useCallback((pull: boolean) => {
    const run = async () => {
      if (!getSession()) return;
      setSyncing(true);
      const key = keyOf(current());
      try {
        await reconcile(pull);
        ready.current = true;
        failures.current = 0;
        pausedKey.current = null;
        setSyncError(null);
      } catch (e) {
        if (!getSession()) return;
        if (e instanceof ApiError && e.status === 413) {
          // no point in repeating; waits for the next change
          pausedKey.current = key;
          setSyncError(t('syncTooLarge'));
        } else {
          failures.current += 1;
          setSyncError(e instanceof ApiError && e.status === 0 ? t('syncOffline') : t('syncFailed'));
        }
      } finally {
        setSyncing(false);
      }
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  }, []);

  const drop = useCallback(() => {
    clearSession();
    // the profile link belongs to the account
    if (meRef.current.share) {
      const next = { ...meRef.current, share: null };
      meRef.current = next;
      setMe(next);
      saveMe(next);
    }
    reset();
    setSessionState(null);
    setSyncError(null);
    setDevCode(null);
    setNotStored(false);
  }, []);

  // a 401 on any call means the token is gone
  useEffect(() => {
    setSessionLostHandler(drop);
  }, [drop]);

  // app start: pull the account once and refresh the push token, which can change
  useEffect(() => {
    if (!getSession()) return;
    sync(true);
    registerPush().catch(() => {});
  }, []);

  // coming back to the foreground: pull again, at most once a minute
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && getSession() && Date.now() - lastPull.current > FOREGROUND_PULL_MS) sync(true);
    });
    return () => sub.remove();
  }, []);

  // every change goes to the account after a pause; a failed first pull is retried with a growing delay
  useEffect(() => {
    if (!session) return;
    const key = keyOf({ people, me, tombs });
    if (pausedKey.current !== null && pausedKey.current !== key) {
      pausedKey.current = null;
      failures.current = 0;
    }
    if (pausedKey.current === key) return;
    if (ready.current && key === sent.current) return;
    const delay = failures.current > 0 ? Math.min(RETRY_BASE_MS * 2 ** (failures.current - 1), RETRY_MAX_MS) : DEBOUNCE_MS;
    const t = setTimeout(() => sync(!ready.current), delay);
    return () => clearTimeout(t);
  }, [people, me, tombs, session, syncError, syncing]);

  const removePerson = (id: string) => {
    applyPeople((all) => all.filter((p) => p.id !== id));
    setTombs([...tombsRef.current.filter((t) => t.id !== id), { id, updatedAt: Date.now() }]);
  };

  const requestCode = async (email: string) => {
    const r = await call<{ dev_code?: string } | undefined>('POST', '/auth/request-code', { email: email.trim().toLowerCase(), language: getLanguage() }, false);
    setDevCode(r?.dev_code ?? null);
  };
  const verify = async (email: string, code: string) => {
    const r = await call<{ token: string; user: { email: string } }>('POST', '/auth/verify', { email: email.trim().toLowerCase(), code: code.trim() }, false);
    const next: Session = { token: r.token, email: r.user.email };
    reset();
    setNotStored(!setSession(next));
    setSessionState(next);
    setDevCode(null);
    saveLanguage(getLanguage());
    // notifications allowed earlier, e.g. in the onboarding, start now
    registerPush().catch(() => {});
    sync(true);
  };
  const saveLanguage = (lang: Lang) => {
    if (getSession()) call('PUT', '/me/settings', { language: lang }).catch(() => {});
  };
  const signOut = async () => {
    await unregisterPush();
    await call('POST', '/auth/logout').catch(() => {});
    drop();
  };
  const deleteAccount = async () => {
    await unregisterPush();
    await call('DELETE', '/me');
    // the data stays on this device
    drop();
  };

  return { session, syncing, syncError, notStored, devCode, requestCode, verify, signOut, deleteAccount, removePerson, saveLanguage };
}
