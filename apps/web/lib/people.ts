// Per-person history, client-side only (localStorage). No backend, no login.
import { useMemo, useSyncExternalStore } from "react";
import type { Result } from "./api";

export type PersonEntry = {
  name: string;
  occasion: string;
  budget_eur: number;
  id: string;
  status: Result["status"];
  created_at: string;
  top: string | null;
};

const KEY = "gift-requests";
const EVENT = "gift-requests-change";

const read = () => {
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return "[]";
  }
};

export function savePerson(entry: PersonEntry) {
  try {
    const all = (JSON.parse(read()) as PersonEntry[]).filter((e) => e.id !== entry.id);
    // ponytail: capped at 50 entries, no pruning UI
    localStorage.setItem(KEY, JSON.stringify([entry, ...all].slice(0, 50)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // storage blocked or full: the history is a convenience, the request itself still works
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Entries grouped by person name, newest first. Empty during SSR and hydration. */
export function usePeople(): [string, PersonEntry[]][] {
  const raw = useSyncExternalStore(subscribe, read, () => "[]");
  return useMemo(() => {
    const groups = new Map<string, PersonEntry[]>();
    try {
      for (const e of JSON.parse(raw) as PersonEntry[]) {
        groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
      }
    } catch {
      // corrupt storage: show nothing
    }
    return [...groups];
  }, [raw]);
}
