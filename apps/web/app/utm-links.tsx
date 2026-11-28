"use client";

import { useEffect } from "react";

const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

// Carries the visit's UTM parameters over to the links into the web app, so the app can note where a new user
// came from (openspec/changes/admin-console, design.md 3). Links marked with data-app-link.
export function UtmLinks() {
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const found = UTM.filter((k) => query.get(k));
    if (!found.length) return;
    document.querySelectorAll<HTMLAnchorElement>("a[data-app-link]").forEach((a) => {
      const url = new URL(a.href);
      for (const k of found) if (!url.searchParams.has(k)) url.searchParams.set(k, query.get(k)!);
      a.href = url.toString();
    });
  }, []);
  return null;
}
