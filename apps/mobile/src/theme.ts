// "Gift tags" direction, mirrors docs/design/gift-tags.css
export const C = {
  ink: '#0b0b0c',
  paper: '#ffffff',
  mute: '#5f5f66',
  tomato: '#ff5a3c',
  lemon: '#ffd23f',
  mint: '#7fd6a8',
  lilac: '#c9a7ff',
  sky: '#8fd3ff',
};

export const TAG_COLORS = [C.tomato, C.lemon, C.mint, C.lilac, C.sky];

// Names registered through useFonts in App.tsx
export const F = {
  display: 'BricolageGrotesque_800ExtraBold',
  text: 'InstrumentSans_400Regular',
  semi: 'InstrumentSans_600SemiBold',
  bold: 'InstrumentSans_700Bold',
  mono: 'DMMono_500Medium',
};

export const eur = (n: number | null | undefined) => (n == null ? '–' : '€' + (Number.isInteger(n) ? n : n.toFixed(2)));
