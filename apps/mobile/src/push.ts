import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import { call, getSession } from './api';
import { readSettings, writeSettings } from './i18n';

// Push for price drops and close birthdays, see openspec/changes/onboarding-language-push (design.md 3) and docs/api.md.
// The backend sends straight to APNs, so the app registers the raw device token, not an Expo token.

export type PushTarget = { personId?: string; slug?: string };

// a note that arrives while the app is open still shows as a banner
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Registration and sign-out run one after the other, so a registration that is still on its way cannot land
// after the session it belongs to has ended (or on the next account after a switch).
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

// iOS may never answer the token request (no APNs connection, simulator); nothing may wait on it forever
const TOKEN_TIMEOUT_MS = 10_000;
const SIGN_OUT_WAIT_MS = 5_000;
function within<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

// short fingerprint, so the session token itself is not written a second time
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Registers this phone with the account when notifications are allowed; does nothing when signed out
export function registerPush(): Promise<void> {
  return serial(async () => {
    const session = getSession();
    if (!session) return;
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const device = await within(Notifications.getDevicePushTokenAsync(), TOKEN_TIMEOUT_MS, null);
    const token = device?.data;
    if (typeof token !== 'string' || !token) return;
    // signed out or switched accounts while asking iOS for the token
    if (getSession()?.token !== session.token) return;
    // token and session already registered together: nothing to send on every return to the foreground
    const done = `${token}|${hash(session.token)}`;
    if (readSettings().pushDone === done) return;
    await call('POST', '/me/devices', { token, platform: 'ios' });
    writeSettings({ pushToken: token, pushDone: done });
  });
}

// The onboarding's "Allow notifications"; registers right away when signed in, otherwise after the next sign-in
export async function askPush(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  if (granted) registerPush().catch(() => {});
  return granted;
}

// Sign-out: waits for a running registration, then gives the token to POST /auth/logout, which removes the
// device in the same call as the session. The local token is only forgotten once that call went through.
export function pushTokenForSignOut(): Promise<string | null> {
  const stored = () => readSettings().pushToken ?? null;
  // a registration still on its way gets a few seconds; after that the stored token is used as it is
  return within(serial(async () => stored()), SIGN_OUT_WAIT_MS, null).then((t) => t ?? stored());
}
export function forgetPushToken(): void {
  writeSettings({ pushToken: null, pushDone: null });
}

// Permission granted later in the iOS settings, or a new token from iOS: register again
export function watchPush(): () => void {
  const app = AppState.addEventListener('change', (s) => {
    if (s === 'active') registerPush().catch(() => {});
  });
  const tok = Notifications.addPushTokenListener(() => {
    registerPush().catch(() => {});
  });
  return () => {
    app.remove();
    tok.remove();
  };
}

// APNs keys outside `aps` arrive in the trigger's payload; content.data only holds a nested `body`
const targetOf = (r: Notifications.NotificationResponse): PushTarget => {
  const { content, trigger } = r.notification.request;
  const payload = trigger && 'payload' in trigger ? (trigger.payload ?? {}) : {};
  const data = { ...payload, ...(content.data ?? {}) } as Record<string, unknown>;
  return {
    personId: typeof data.personId === 'string' ? data.personId : undefined,
    slug: typeof data.slug === 'string' ? data.slug : undefined,
  };
};

// Tapping a note opens its target, also the tap that started the app
export function onPushOpen(open: (target: PushTarget) => void): () => void {
  const last = Notifications.getLastNotificationResponse();
  if (last) {
    Notifications.clearLastNotificationResponse();
    open(targetOf(last));
  }
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    Notifications.clearLastNotificationResponse();
    open(targetOf(r));
  });
  return () => sub.remove();
}
