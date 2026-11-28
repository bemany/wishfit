import { useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Account } from './account';
import { SignIn } from './account-ui';
import { t, type Lang } from './i18n';
import { askPush } from './push';
import { Body, Btn, LanguagePicker, Mono, Say } from './ui';

type Step = 'language' | 'intro' | 'signin' | 'push';

// First start: language, a short intro, sign-in, then notifications (skipped on the web). Signed in already
// (e.g. an update), the sign-in step is left out.
// see openspec/changes/onboarding-language-push (design.md 2) and openspec/changes/signin-required (design.md 2)
export function Onboarding({ lang, account, onLanguage, onSignedIn, onDone }: { lang: Lang; account: Account; onLanguage: (lang: Lang) => void; onSignedIn: () => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  // on a wide (desktop) window the steps sit in the middle, on a phone at the thumb
  const wide = useWindowDimensions().width >= 700;
  const steps: Step[] = ['language', 'intro', ...(account.session ? [] : ['signin' as const]), ...(Platform.OS === 'web' ? [] : ['push' as const])];
  const [step, setStep] = useState<Step>('language');
  const next = () => {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) setStep(steps[i + 1]);
    else onDone();
  };
  if (step === 'signin')
    return (
      <SignIn
        account={account}
        lang={lang}
        onLanguage={onLanguage}
        onBack={() => setStep('intro')}
        onDone={() => {
          onSignedIn();
          if (Platform.OS === 'web') onDone();
          else setStep('push');
        }}
      />
    );
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, justifyContent: wide ? 'center' : 'flex-end', gap: 24 }}>
      {step === 'language' ? (
        <View style={{ gap: 16 }}>
          <Say>{t('obLanguage')}</Say>
          <LanguagePicker value={lang} onChange={onLanguage} />
          <Mono mute>{t('obLanguageHint')}</Mono>
        </View>
      ) : step === 'intro' ? (
        <View style={{ gap: 16 }}>
          <Say>{t('obTitle')}</Say>
          <Body>{t('obBody')}</Body>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Say>{t('obPushTitle')}</Say>
          <Body>{t('obPushBody')}</Body>
        </View>
      )}
      {step === 'push' ? (
        <View style={{ gap: 8 }}>
          {/* signed in by now, so a granted permission registers the device right away */}
          <Btn label={t('obAllow')} onPress={() => askPush().catch(() => false).finally(onDone)} />
          <Btn label={t('obLater')} secondary onPress={onDone} />
        </View>
      ) : (
        <Btn label={t('continue')} onPress={next} />
      )}
    </View>
  );
}
