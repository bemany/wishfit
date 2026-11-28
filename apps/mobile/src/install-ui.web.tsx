import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { promptInstall, snoozeInstall, useInstallMode } from './install';
import { t } from './i18n';
import { C, F } from './theme';
import { Body, Btn, Mono, Say } from './ui';

const SHARE = 'M12 15V4M8 7.5l4-4 4 4M7 10H5.5v10h13V10H17';
const ADD = 'M4.5 4.5h15v15h-15zM12 8v8M8 12h8';

const Glyph = ({ d }: { d: string }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d={d} stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const Step = ({ n, d, text }: { n: number; d?: string; text: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: C.ink, backgroundColor: C.lemon, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: F.display, fontSize: 16, color: C.ink }}>{n}</Text>
    </View>
    <Body style={{ flex: 1 }}>{text}</Body>
    {d && <Glyph d={d} />}
  </View>
);

// Bottom sheet in the gift-tag look: Android/Chrome gets a button, iPhone Safari the steps, other iOS browsers a pointer to Safari
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const insets = useSafeAreaInsets();
  const mode = useInstallMode();
  if (!open || mode === 'none') return null;
  const later = () => {
    snoozeInstall();
    onClose();
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 50, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11,11,12,0.5)' }} />
      <View accessibilityViewIsModal style={{ backgroundColor: C.lemon, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 2, borderBottomWidth: 0, borderColor: C.ink, paddingTop: 36, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, gap: 16 }}>
        <View style={{ position: 'absolute', top: 12, alignSelf: 'center', width: 16, height: 16, borderRadius: 8, backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink }} />
        <Mono>{t('installLabel')}</Mono>
        <Say style={{ maxWidth: '100%' }}>{t('installTitle')}</Say>
        {mode === 'prompt' ? (
          <>
            <Body>{t('installBody')}</Body>
            <Btn label={t('installButton')} onPress={() => promptInstall().then((ok) => ok && onClose())} />
            <Btn label={t('installLater')} secondary onPress={later} />
          </>
        ) : mode === 'ios-safari' ? (
          <>
            <View style={{ gap: 14 }}>
              <Step n={1} d={SHARE} text={t('installIos1')} />
              <Step n={2} d={ADD} text={t('installIos2')} />
              <Step n={3} text={t('installIos3')} />
            </View>
            <Btn label={t('installGotIt')} onPress={onClose} />
            <Btn label={t('installLater')} secondary onPress={later} />
          </>
        ) : (
          <>
            <Body>{t('installOpenSafari')}</Body>
            <Btn label={t('installGotIt')} onPress={onClose} />
            <Btn label={t('installLater')} secondary onPress={later} />
          </>
        )}
      </View>
    </View>
  );
}

// A row under "Me" that opens the sheet any time; hidden once the app runs installed
export function InstallRow(): ReactNode {
  const mode = useInstallMode();
  const [open, setOpen] = useState(false);
  if (mode === 'none') return null;
  return (
    <View style={{ gap: 8 }}>
      <Mono mute>{t('installLabel')}</Mono>
      <Btn label={t('installRow')} secondary onPress={() => setOpen(true)} />
      <InstallSheet open={open} onClose={() => setOpen(false)} />
    </View>
  );
}
