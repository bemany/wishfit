import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { t, type Lang } from './i18n';
import { C, F } from './theme';

const ICONS = {
  back: 'M15 6l-6 6 6 6',
  plus: 'M12 5v14M5 12h14',
  send: 'M12 19V5M5 12l7-7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5 11a7 7 0 0014 0M12 18v3',
  me: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20c0-3.3 3.6-6 8-6s8 2.7 8 6',
} as const;

type TP = TextProps & { style?: StyleProp<TextStyle>; children?: ReactNode };

export const Mono = ({ mute, style, ...p }: TP & { mute?: boolean }) => <Text {...p} style={[s.mono, mute && { color: C.mute }, style]} />;
export const Body = ({ style, ...p }: TP) => <Text {...p} style={[s.body, style]} />;
// The agent speaks without a bubble
export const Say = ({ style, ...p }: TP) => <Text {...p} style={[s.say, style]} />;
export const Name = ({ style, ...p }: TP) => <Text {...p} style={[s.name, style]} />;

// A long message (one with a `note`) is shortened; tapping it expands and collapses it
export function Bubble({ children, note }: { children: string; note?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable accessibilityRole={note ? 'button' : undefined} disabled={!note} onPress={() => setOpen((o) => !o)} style={s.bubble}>
      <Text style={[s.body, { color: '#fff' }]} numberOfLines={note && open ? undefined : 3}>
        {children}
      </Text>
      {note && <Mono style={{ color: '#fff', opacity: 0.7 }}>{open ? t('tapCollapse') : t('tapExpand', { note })}</Mono>}
    </Pressable>
  );
}

// The hang tag: one per person and one per pick
export function Tag({ color, onPress, style, children, label }: { color: string; onPress?: () => void; style?: StyleProp<ViewStyle>; children: ReactNode; label?: string }) {
  const body = (
    <>
      <View style={s.hole} />
      {children}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.tag, { backgroundColor: color }, style]}>
      {body}
    </Pressable>
  ) : (
    <View style={[s.tag, { backgroundColor: color }, style]}>{body}</View>
  );
}

const TILT = ['-3deg', '2deg', '-1deg'];
// Rubber stamp for an idealo signal
export const Stamp = ({ label, value, i = 0 }: { label: string; value: string; i?: number }) => (
  <View style={[s.stamp, { transform: [{ rotate: TILT[i % TILT.length] }] }]}>
    <Text style={s.stampLabel}>{label.replace(/_/g, ' ')}</Text>
    <Text style={s.stampValue}>{value}</Text>
  </View>
);
export const Stamps = ({ children }: { children: ReactNode }) => <View style={s.stamps}>{children}</View>;

export const Pill = ({ label, onPress, large }: { label: string; onPress?: () => void; large?: boolean }) => (
  <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress} style={[s.pill, large && { minHeight: 44, paddingHorizontal: 16 }]}>
    <Text style={[s.pillText, large && { fontSize: 15 }]}>{label}</Text>
  </Pressable>
);

export const Btn = ({ label, onPress, secondary, disabled }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) => (
  <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.btn, secondary && { backgroundColor: C.paper }, disabled && { opacity: 0.3 }]}>
    <Text style={[s.btnText, secondary && { color: C.ink }]}>{label}</Text>
  </Pressable>
);

// Deutsch / English, the chosen one filled
export const LanguagePicker = ({ value, onChange }: { value: Lang; onChange: (lang: Lang) => void }) => (
  <View style={{ flexDirection: 'row', gap: 8 }}>
    {(['de', 'en'] as const).map((l) => (
      <View key={l} style={{ flex: 1 }}>
        <Btn label={l === 'de' ? 'Deutsch' : 'English'} secondary={l !== value} onPress={() => onChange(l)} />
      </View>
    ))}
  </View>
);

export const Round = ({ icon, label, onPress, ink, size = 44, fill }: { icon: keyof typeof ICONS; label: string; onPress: () => void; ink?: boolean; size?: number; fill?: string }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.round, { width: size, height: size }, ink && { backgroundColor: C.ink }, fill != null && { backgroundColor: fill }]}>
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d={ICONS[icon]} stroke={ink ? '#fff' : C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  </Pressable>
);

export const TopBar = ({ onBack, title, left, right }: { onBack?: () => void; title?: string; left?: ReactNode; right?: ReactNode }) => (
  <View style={s.top}>
    {onBack ? <Round icon="back" label={t('back')} onPress={onBack} /> : left}
    {title && (
      <Mono numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
        {title}
      </Mono>
    )}
    {right ?? <View style={{ width: 44 }} />}
  </View>
);

// The fixed header of a screen: the bar stays put, 10 pt of air below it, and the scrolling content fades out
// in a short gradient under it instead of being cut off hard at the back button
export const Header = (p: { onBack?: () => void; title?: string; left?: ReactNode; right?: ReactNode }) => (
  <View style={{ zIndex: 2, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: C.paper }}>
    <TopBar {...p} />
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: 16 }}>
      <Svg width="100%" height="16">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.paper} stopOpacity={1} />
            <Stop offset="1" stopColor={C.paper} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="16" fill="url(#fade)" />
      </Svg>
    </View>
  </View>
);

// Outlined row: alternatives, steps, price breakdown
export const Line = ({ color = C.mint, title, sub, right, left, last, onPress }: { left?: ReactNode; color?: string; title: string; sub?: string; right?: ReactNode; last?: boolean; onPress?: () => void }) => (
  <Pressable disabled={!onPress} onPress={onPress} style={[s.line, last && { borderBottomWidth: 2 }]}>
    {left ?? <View style={[s.dot, { backgroundColor: color }]} />}
    <View style={{ flex: 1 }}>
      <Text style={s.lineTitle}>{title}</Text>
      {sub && (
        <Text style={s.lineSub} numberOfLines={3}>
          {sub}
        </Text>
      )}
    </View>
    {typeof right === 'string' ? <Text style={s.lineTitle}>{right}</Text> : right}
  </Pressable>
);

export const s = StyleSheet.create({
  mono: { fontFamily: F.mono, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, textTransform: 'uppercase', color: C.ink },
  body: { fontFamily: F.text, fontSize: 16, lineHeight: 22, color: C.ink },
  say: { fontFamily: F.display, fontSize: 26, lineHeight: 29, letterSpacing: -0.9, color: C.ink, alignSelf: 'flex-start', maxWidth: '92%' },
  name: { fontFamily: F.display, fontSize: 40, lineHeight: 42, letterSpacing: -1.8, color: C.ink },
  display: { fontFamily: F.display, fontSize: 44, lineHeight: 45, letterSpacing: -2, color: C.ink },
  word: { fontFamily: F.display, fontSize: 26, lineHeight: 30, letterSpacing: -1, color: C.ink },
  price: { fontFamily: F.display, fontSize: 64, lineHeight: 66, letterSpacing: -3.2, color: C.ink, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: 12 },
  bubble: { alignSelf: 'flex-end', maxWidth: '84%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22, borderBottomRightRadius: 4, backgroundColor: C.ink, gap: 4 },
  tag: { gap: 10, paddingTop: 44, paddingHorizontal: 20, paddingBottom: 20, borderRadius: 28, borderWidth: 2, borderColor: C.ink },
  hole: { position: 'absolute', top: 14, alignSelf: 'center', width: 16, height: 16, borderRadius: 8, backgroundColor: C.paper, borderWidth: 2, borderColor: C.ink },
  stamps: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 10, paddingVertical: 4 },
  stamp: { paddingTop: 7, paddingBottom: 6, paddingHorizontal: 10, borderWidth: 2, borderColor: C.ink, borderRadius: 8, gap: 1, maxWidth: '100%' },
  stampLabel: { fontFamily: F.mono, fontSize: 11, lineHeight: 14, letterSpacing: 0.55, textTransform: 'uppercase', color: C.ink },
  stampValue: { fontFamily: F.display, fontSize: 16, lineHeight: 19, letterSpacing: -0.3, color: C.ink },
  pill: { minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, justifyContent: 'center' },
  pillText: { fontFamily: F.semi, fontSize: 14, color: C.ink },
  btn: { minHeight: 56, paddingHorizontal: 22, borderRadius: 999, backgroundColor: C.ink, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontFamily: F.bold, fontSize: 17, color: '#fff' },
  round: { borderRadius: 999, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderTopWidth: 2, borderColor: C.ink },
  lineTitle: { fontFamily: F.display, fontSize: 20, lineHeight: 23, letterSpacing: -0.6, color: C.ink },
  lineSub: { fontFamily: F.text, fontSize: 14, lineHeight: 20, color: C.mute },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.ink },
  input: { flex: 1, minHeight: 52, maxHeight: 120, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, borderRadius: 26, borderWidth: 2, borderColor: C.ink, backgroundColor: C.paper, fontFamily: F.text, fontSize: 16, lineHeight: 20, color: C.ink },
});
