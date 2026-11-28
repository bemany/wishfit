import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { call, clearSession } from './api';
import { t } from './i18n';
import { clearImpersonation, impersonation, notifyEnded } from './impersonation';
import { C, F } from './theme';
import { Body, Name } from './ui';

// The admin simulator's banner and end screen, see openspec/changes/admin-console (design.md 2). Only rendered
// on the web inside the console's iframe; impersonation is always null in the native app.

const RED = '#d92d20';

// Ends the view: the server drops the session, this tab forgets everything the view stored
export const endImpersonation = async () => {
  try {
    await call('DELETE', '/admin/impersonate');
  } catch {
    // expired or already ended: the local end still happens
  }
  clearSession();
  if (impersonation) clearImpersonation(impersonation.prefix);
  notifyEnded();
};

export function ImpersonationStrip({ email }: { email: string }) {
  const [ending, setEnding] = useState(false);
  return (
    <View testID="imp-strip" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: RED, paddingVertical: 8, paddingHorizontal: 12 }}>
      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.paper, fontFamily: F.semi, fontSize: 13 }}>
        {t('impViewing', { email })}
      </Text>
      <Text style={{ color: C.paper, opacity: 0.6 }}>·</Text>
      <Pressable
        accessibilityRole="button"
        disabled={ending}
        onPress={() => {
          setEnding(true);
          endImpersonation().finally(() => setEnding(false));
        }}
      >
        <Text style={{ color: C.paper, fontFamily: F.bold, fontSize: 13, textDecorationLine: 'underline', opacity: ending ? 0.5 : 1 }}>{t('impEnd')}</Text>
      </Pressable>
    </View>
  );
}

export function ImpersonationEnded() {
  useEffect(() => {
    if (impersonation) clearImpersonation(impersonation.prefix);
    notifyEnded();
  }, []);
  return (
    <View testID="imp-ended" style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
      <Name>{t('impEnded')}</Name>
      <Body style={{ color: C.mute }}>{t('impEndedHint')}</Body>
    </View>
  );
}
