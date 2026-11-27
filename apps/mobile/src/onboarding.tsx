import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t, type Lang } from './i18n';
import { askPush } from './push';
import { Body, Btn, LanguagePicker, Mono, Say } from './ui';

// First start: language, a short intro, then notifications (skipped on the web).
// see openspec/changes/onboarding-language-push (design.md 2)
export function Onboarding({ lang, signedIn, onLanguage, onDone }: { lang: Lang; signedIn: boolean; onLanguage: (lang: Lang) => void; onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const last = Platform.OS === 'web' ? 1 : 2;
  const next = () => (step < last ? setStep(step + 1) : onDone());
  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: insets.bottom + 24, justifyContent: 'flex-end', gap: 24 }}>
      {step === 0 ? (
        <View style={{ gap: 16 }}>
          <Say>{t('obLanguage')}</Say>
          <LanguagePicker value={lang} onChange={onLanguage} />
          <Mono mute>{t('obLanguageHint')}</Mono>
        </View>
      ) : step === 1 ? (
        <View style={{ gap: 16 }}>
          <Say>{t('obTitle')}</Say>
          <Body>{t('obBody')}</Body>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Say>{t('obPushTitle')}</Say>
          <Body>{t('obPushBody')}</Body>
          {!signedIn && <Mono mute>{t('obPushSignedOut')}</Mono>}
        </View>
      )}
      {step === 2 ? (
        <View style={{ gap: 8 }}>
          <Btn label={t('obAllow')} onPress={() => askPush().catch(() => false).finally(onDone)} />
          <Btn label={t('obLater')} secondary onPress={onDone} />
        </View>
      ) : (
        <Btn label={t('continue')} onPress={next} />
      )}
    </View>
  );
}
