import { useEffect, useState } from 'react';

import { readJson, writeJson } from './storage';

// Install hint of the web app, see openspec/changes/pwa-journey (design.md 1 to 4).
// index.html catches beforeinstallprompt before React starts and keeps it in window.__wfInstall.

export type InstallMode = 'none' | 'prompt' | 'ios-safari' | 'ios-other';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const win = window as unknown as { __wfInstall?: InstallEvent | null };

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ua = () => navigator.userAgent;
const ios = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// every iOS browser except Safari names itself (Chrome, Firefox, Edge, Opera, Google app, in-app browsers)
const iosOther = () => /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua());

export const installMode = (): InstallMode => {
  if (standalone()) return 'none';
  if (win.__wfInstall) return 'prompt';
  if (ios()) return iosOther() ? 'ios-other' : 'ios-safari';
  return 'none';
};

// Re-renders when the browser delivers the install event late or the app got installed
export const useInstallMode = (): InstallMode => {
  const [mode, setMode] = useState(installMode);
  useEffect(() => {
    const update = () => setMode(installMode());
    window.addEventListener('wf-install', update);
    update();
    return () => window.removeEventListener('wf-install', update);
  }, []);
  return mode;
};

export const promptInstall = async (): Promise<boolean> => {
  const event = win.__wfInstall;
  if (!event) return false;
  try {
    await event.prompt();
    const { outcome } = await event.userChoice;
    // a prompt event works once
    win.__wfInstall = null;
    window.dispatchEvent(new Event('wf-install'));
    return outcome === 'accepted';
  } catch {
    return false;
  }
};

const DAY = 24 * 60 * 60 * 1000;
export const snoozeInstall = () => writeJson('installDismissedAt', Date.now());

// Whether the hint opens by itself now: after the onboarding, and once more after the first recommendation.
// "Later" hides it for 7 days.
export function installTrigger(when: 'onboarding' | 'recommendation'): boolean {
  if (installMode() === 'none') return false;
  const at = readJson('installDismissedAt');
  if (typeof at === 'number' && Date.now() - at < 7 * DAY) return false;
  if (when === 'recommendation') {
    if (readJson('installRecShown') === true) return false;
    writeJson('installRecShown', true);
  }
  return true;
}
