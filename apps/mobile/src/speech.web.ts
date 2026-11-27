// Web variant of src/speech.ts: the browser's Web Speech API where it exists (Chrome, Safari), otherwise no microphone.
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};
type RecognitionCtor = new () => Recognition;

const Ctor = (): RecognitionCtor | null => {
  const w = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }) : null;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
};

export const speechAvailable = () => Ctor() !== null;
// The browser asks for the microphone itself when recognition starts
export const askMicPermission = async () => 'granted' as const;

export const MIC_BUSY = 'The microphone is not available right now, another app may be using it.';

const MESSAGES: Record<string, string> = {
  'not-allowed': 'Dictation needs microphone access. Allow it in the browser and try again.',
  'service-not-allowed': 'Dictation needs microphone access. Allow it in the browser and try again.',
  'audio-capture': MIC_BUSY,
  network: 'Dictation needs a connection in this browser.',
};

export async function dictate(onText: (text: string) => void, onEnd: (error: string | null) => void, locale: string) {
  const R = Ctor();
  if (!R) return null;
  const rec = new R();
  rec.lang = locale;
  rec.continuous = true;
  rec.interimResults = true;
  let text = '';
  let stopped = false;
  let failed = false;
  rec.onresult = (e) => {
    let out = '';
    for (let i = 0; i < e.results.length; i++) out += e.results[i][0].transcript;
    text = out;
    onText(out);
  };
  rec.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    failed = true;
    onEnd(MESSAGES[e.error] ?? 'Dictation stopped unexpectedly.');
  };
  rec.onend = () => {
    if (!stopped && !failed) onEnd(null);
  };
  try {
    rec.start();
  } catch (e) {
    onEnd(e instanceof Error ? e.message : 'Dictation did not start.');
    return null;
  }
  return {
    stop: async () => {
      stopped = true;
      rec.stop();
      onEnd(null);
      return text;
    },
  };
}
