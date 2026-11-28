import { useEffect, useState } from 'react';

import { readJson, writeJson } from './storage';

// Install hint of the web app, see openspec/changes/pwa-journey (design.md 1 to 4) and pwa-guided-install.
// index.html catches beforeinstallprompt before React starts and keeps it in window.__wfInstall.

// What the sheet shows, decided from the browser (openspec/changes/pwa-guided-install)
export type InstallMode =
  | 'none' // runs installed already
  | 'prompt' // the browser offers its own dialog (Android, Chrome/Edge on the desktop)
  | 'ios-compact' // Safari on iOS 26+, compact bar: menu, Share, Show more
  | 'ios-safari' // Safari on iOS up to 18, Share in the toolbar
  | 'ios-other' // Chrome, Edge, Firefox on iOS 16.4+
  | 'ios-old' // iOS browser that cannot add to the home screen
  | 'android-inapp' // WebView or in-app browser: open in Chrome
  | 'android' // menu, "Install app"
  | 'samsung'
  | 'desktop' // install icon in the address bar
  | 'mac-safari' // File, Add to Dock
  | 'other';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const win = window as unknown as { __wfInstall?: InstallEvent | null };

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ua = () => navigator.userAgent;
const ios = () => /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// every iOS browser except Safari names itself (Chrome, Firefox, Edge, Opera, Google app, in-app browsers)
const iosOther = () => /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua());
// in-app browsers (Facebook, Instagram, Line, Google app) have no way to add to the home screen
const inApp = () => /FBAN|FBAV|Instagram|Line\/|GSA\//.test(ua());
const iosInApp = inApp;
// Safari 26 keeps "OS 18_6" in its user agent, so its own version decides; other iOS browsers show the system version
const iosVersion = (): number => {
  const m = ua().match(/Version\/(\d+)/) ?? ua().match(/OS (\d+)_/);
  return m ? Number(m[1]) : 0;
};
const ipad = () => /iPad/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// 0 = unknown (an iPad in desktop mode hides the system version)
const iosMinor = (): number => {
  const m = ua().match(/OS (\d+)_(\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : 0;
};

export const installMode = (): InstallMode => {
  if (standalone()) return 'none';
  if (win.__wfInstall) return 'prompt';
  const agent = ua();
  if (ios()) {
    if (iosInApp()) return 'ios-old';
    if (iosOther()) return iosMinor() === 0 || iosMinor() >= 16.04 ? 'ios-other' : 'ios-old';
    // iPadOS keeps the toolbar with Share, only the iPhone has the compact bar
    return !ipad() && iosVersion() >= 26 ? 'ios-compact' : 'ios-safari';
  }
  if (/Android/.test(agent)) {
    if (/; wv\)|FBAN|FBAV|Instagram|Line\//.test(agent)) return 'android-inapp';
    return /SamsungBrowser/.test(agent) ? 'samsung' : /Chrome|EdgA/.test(agent) ? 'android' : 'other';
  }
  if (/Macintosh/.test(agent) && /Safari\//.test(agent) && !/Chrome|Chromium|Edg|Firefox|OPR/.test(agent)) return iosVersion() >= 17 ? 'mac-safari' : 'other';
  if (/Chrome|Edg/.test(agent) && !/OPR/.test(agent)) return 'desktop';
  return 'other';
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
  const mode = installMode();
  if (mode === 'none' || mode === 'other' || mode === 'ios-old' || mode === 'android-inapp') return false;
  const at = readJson('installDismissedAt');
  if (typeof at === 'number' && Date.now() - at < 7 * DAY) return false;
  if (when === 'recommendation') {
    if (readJson('installRecShown') === true) return false;
    writeJson('installRecShown', true);
  }
  return true;
}
