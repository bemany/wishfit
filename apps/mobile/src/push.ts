import * as Notifications from 'expo-notifications';

import { call, getSession } from './api';
import { readSettings, writeSettings } from './i18n';

// Push for price drops and close birthdays, see openspec/changes/onboarding-language-push (design.md 3) and docs/api.md.
// The backend sends straight to APNs, so the app registers the raw device token, not an Expo token.

export type PushTarget = { personId?: string; slug?: string };

// a note that arrives while the app is open still shows as a banner
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

// Registers this phone with the account when notifications are allowed; does nothing when signed out
export async function registerPush(): Promise<void> {
  if (!getSession()) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;
  const { data: token } = await Notifications.getDevicePushTokenAsync();
  if (typeof token !== 'string' || !token) return;
  await call('POST', '/me/devices', { token, platform: 'ios' });
  writeSettings({ pushToken: token });
}

// The onboarding's "Allow notifications"; registers right away when signed in, otherwise after the next sign-in
export async function askPush(): Promise<boolean> {
  const { granted } = await Notifications.requestPermissionsAsync();
  if (granted) registerPush().catch(() => {});
  return granted;
}

// Before sign-out and account deletion, while the session still works
export async function unregisterPush(): Promise<void> {
  const token = readSettings().pushToken;
  if (!token) return;
  writeSettings({ pushToken: null });
  if (getSession()) await call('DELETE', `/me/devices/${encodeURIComponent(token)}`).catch(() => {});
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
