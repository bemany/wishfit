import { useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { promptInstall, snoozeInstall, useInstallMode, type InstallMode } from './install';
import { t, type Key } from './i18n';
import { C, F } from './theme';
import { Body, Btn, Mono } from './ui';

// Guided installation, see openspec/changes/pwa-guided-install: a banner on top, a sheet with the app card and
// numbered steps. The chips in the steps look like the real browser controls.

const ICONS = {
  menu: 'M4 7h16M4 12h16M4 17h10',
  dots: 'M12 5.5v.01M12 12v.01M12 18.5v.01',
  share: 'M12 15V4M8 7.5l4-4 4 4M7 10H5.5v10h13V10H17',
  more: 'M7 10l5 5 5-5z',
  add: 'M4.5 4.5h15v15h-15zM12 8v8M8 12h8',
  install: 'M3.5 4.5h17v11h-17zM8 19.5h8M12 15.5v4M9 8.5l3 3 3-3M12 11.5v-6',
} as const;
type Icon = keyof typeof ICONS;

const Glyph = ({ name, size = 16 }: { name: Icon; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'more' ? C.ink : 'none'}>
    <Path d={ICONS[name]} stroke={C.ink} strokeWidth={name === 'dots' ? 3.4 : 2.2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

// A browser control as a small chip: symbol, label, or both
const Chip = ({ icon, label }: { icon?: Icon; label?: string }) => (
  <View
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.paper,
      borderWidth: 1.5,
      borderColor: C.ink,
      borderRadius: label ? 10 : 16,
      paddingHorizontal: label ? 8 : 6,
      paddingVertical: 3,
      marginVertical: 2,
    }}
  >
    {icon && <Glyph name={icon} />}
    {label && <Text style={{ fontFamily: F.semi, fontSize: 14, color: C.ink }}>{label}</Text>}
  </View>
);

const CHIPS: Record<string, { icon?: Icon; label?: Key }> = {
  menu: { icon: 'menu' },
  dots: { icon: 'dots' },
  share: { icon: 'share', label: 'chipShare' },
  more: { icon: 'more', label: 'chipMore' },
  addHome: { icon: 'add', label: 'chipAddHome' },
  installIcon: { icon: 'install' },
  installApp: { icon: 'install', label: 'chipInstallApp' },
  addStart: { icon: 'add', label: 'chipAddStart' },
  addPageTo: { label: 'chipAddPageTo' },
  homeScreen: { label: 'chipHomeScreen' },
  file: { label: 'chipFile' },
  dock: { label: 'chipDock' },
};

// "Tap {menu} to open the menu": the {name} parts become chips
const Rich = ({ k }: { k: Key }) => (
  <Text style={{ flex: 1, fontFamily: F.text, fontSize: 16, lineHeight: 30, color: C.ink }}>
    {t(k)
      .split(/(\{\w+\})/)
      .map((part, i) => {
        const chip = /^\{(\w+)\}$/.exec(part)?.[1];
        const def = chip ? CHIPS[chip] : undefined;
        return def ? <Chip key={i} icon={def.icon} label={def.label && t(def.label)} /> : part;
      })}
  </Text>
);

const STEPS: Partial<Record<InstallMode, Key[]>> = {
  'ios-compact': ['installCompact1', 'installCompact2', 'installCompact3'],
  'ios-safari': ['installClassic1', 'installClassic2', 'installClassic3'],
  'ios-other': ['installIosOther1', 'installIosOther2', 'installIosOther3'],
  android: ['installAndroid1', 'installAndroid2'],
  samsung: ['installSamsung1', 'installSamsung2'],
  desktop: ['installDesktop1', 'installDesktop2'],
  'mac-safari': ['installMac1', 'installMac2'],
};

const AppIcon = ({ size }: { size: number }) => (
  <Image source={{ uri: '/icon-192.png' }} accessibilityLabel="Wishfit" style={{ width: size, height: size, borderRadius: size * 0.24, borderWidth: 2, borderColor: C.ink }} />
);

// The app as a gift tag: punched hole, icon, name, domain
const AppCard = () => (
  <View style={{ transform: [{ rotate: '-1.5deg' }], backgroundColor: C.tomato, borderWidth: 2, borderColor: C.ink, borderRadius: 20, paddingVertical: 16, paddingLeft: 40, paddingRight: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
    <View style={{ position: 'absolute', left: 12, top: '50%', marginTop: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink }} />
    <AppIcon size={56} />
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: F.display, fontSize: 26, color: C.ink }}>Wishfit</Text>
      <Mono>{window.location.host}</Mono>
    </View>
  </View>
);

const CloseX = ({ onPress, color = C.ink }: { onPress: () => void; color?: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onPress} hitSlop={10} style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  </Pressable>
);

// Bottom sheet "Install app": the Android/desktop dialog behind a button, otherwise the steps for this browser
export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }): ReactNode {
  const insets = useSafeAreaInsets();
  const mode = useInstallMode();
  if (!open) return null;
  const steps = STEPS[mode];
  const close = () => {
    // /install is a link into this sheet; leaving it returns to the app's own address
    if (window.location.pathname === '/install') window.history.replaceState(null, '', '/');
    onClose();
  };
  const later = () => {
    snoozeInstall();
    close();
  };
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, justifyContent: 'flex-end' }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={close} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(11,11,12,0.5)' }} />
      <View accessibilityViewIsModal style={{ backgroundColor: C.lemon, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 2, borderBottomWidth: 0, borderColor: C.ink, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text accessibilityRole="header" style={{ fontFamily: F.display, fontSize: 26, color: C.ink }}>{t('installSheetTitle')}</Text>
          <CloseX onPress={close} />
        </View>
        <AppCard />
        {mode === 'prompt' ? (
          <>
            <Body>{t('installDirect')}</Body>
            <Btn label={t('installButton')} onPress={() => promptInstall().then((ok) => ok && close())} />
          </>
        ) : steps ? (
          <View style={{ gap: 10 }}>
            {steps.map((k, i) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Text style={{ fontFamily: F.display, fontSize: 18, lineHeight: 30, width: 22, color: C.ink }}>{i + 1}.</Text>
                <Rich k={k} />
              </View>
            ))}
          </View>
        ) : (
          <Body>{mode === 'none' ? t('installInstalled') : mode === 'ios-old' ? t('installOpenSafari') : mode === 'android-inapp' ? t('installOpenChrome') : t('installOther')}</Body>
        )}
        {mode !== 'none' && mode !== 'prompt' && mode !== 'other' && mode !== 'ios-old' && mode !== 'android-inapp' && <Btn label={t('installGotIt')} onPress={close} />}
        {mode !== 'none' && <Btn label={t('installLater')} secondary onPress={later} />}
      </View>
    </View>
  );
}

// Banner on top, in the flow above the screen (the app's own top padding moves into it): icon, short text, "Install". The cross hides it for 7 days; on Android/desktop "Install" opens the
// browser dialog directly, elsewhere the sheet with the steps.
export function InstallBanner({ open, onClose, onOpenSheet }: { open: boolean; onClose: () => void; onOpenSheet: () => void }): ReactNode {
  const insets = useSafeAreaInsets();
  const mode = useInstallMode();
  if (!open || mode === 'none' || mode === 'other' || mode === 'ios-old' || mode === 'android-inapp') return null;
  const go = () => {
    if (mode !== 'prompt') return onOpenSheet();
    // accepted or declined, the banner is done; a decline keeps it away for 7 days
    promptInstall().then((ok) => {
      if (!ok) snoozeInstall();
      onClose();
    });
  };
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: C.lemon, borderBottomWidth: 2, borderColor: C.ink, paddingTop: insets.top + 8, paddingBottom: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CloseX
        onPress={() => {
          snoozeInstall();
          onClose();
        }}
      />
      <AppIcon size={44} />
      <Text style={{ flex: 1, fontFamily: F.semi, fontSize: 14, lineHeight: 19, color: C.ink }}>{t('installBanner')}</Text>
      <Pressable accessibilityRole="button" onPress={go} style={{ backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 14, color: '#fff' }}>{t('installBannerButton')}</Text>
      </Pressable>
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
