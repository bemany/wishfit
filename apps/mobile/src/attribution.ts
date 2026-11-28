import { Platform } from 'react-native';

import { readSettings, writeSettings } from './i18n';

// Native side of attribution.web.ts: the app has no UTM parameters, only the inviter from a profile link
// (wishloop://u/<slug>), kept in the settings until the account is created

export type Attribution = { platform?: string; ref?: string };

const SLUG = /^[A-Za-z0-9_-]{6,20}$/;

export const noteRef = (slug: string) => {
  if (SLUG.test(slug) && !readSettings().ref) writeSettings({ ref: slug });
};

export const captureAttribution = () => {};

export const attributionForVerify = (): Attribution => {
  const ref = readSettings().ref;
  return { platform: Platform.OS, ...(ref ? { ref } : {}) };
};
