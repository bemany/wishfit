import type { Permission, SpeechModule } from '../modules/speech';
import { t } from './i18n';

// Thin layer over the native dictation module, adapted from justap.
// Loaded lazily: a build without the native part still runs, it just shows no microphone.
function load(): SpeechModule | null {
  try {
    return (require('../modules/speech') as { default: SpeechModule }).default;
  } catch {
    return null;
  }
}
const native = load();

export const speechAvailable = () => native !== null;
export const askMicPermission = (): Promise<Permission> => (native ? native.requestPermissions().catch(() => 'denied' as const) : Promise.resolve('undetermined'));

// A start normally returns within a fraction of a second; one that hangs (microphone taken by another app) is an error
const START_LIMIT = 5000;

// One dictation session. `onText` gets every interim text of the whole recording so the field follows along.
// `onEnd` is called with a message when recognition breaks off or cannot start, and with null after a normal stop.
export async function dictate(onText: (text: string) => void, onEnd: (error: string | null) => void, locale: string) {
  if (!native) return null;
  const subs = [
    native.addListener('onResult', (e) => onText(e.text)),
    native.addListener('onError', (e) => {
      subs.forEach((x) => x.remove());
      onEnd(e.message);
    }),
  ];
  const fail = (message: string) => {
    subs.forEach((x) => x.remove());
    onEnd(message);
    return null;
  };
  const started = native.start(locale);
  let outcome: 'ok' | 'timeout';
  try {
    outcome = await Promise.race([started.then(() => 'ok' as const), new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), START_LIMIT))]);
  } catch (e) {
    return fail(e instanceof Error ? e.message : t('micNoStart'));
  }
  if (outcome === 'timeout') {
    // if the start still comes back later, end that recording right away: nobody is listening any more
    started.then(
      () => void native.stop().catch(() => {}),
      () => {},
    );
    return fail(t('micBusy'));
  }
  return {
    stop: async () => {
      subs.forEach((x) => x.remove());
      const text = await native.stop().catch(() => '');
      onEnd(null);
      return text;
    },
  };
}
