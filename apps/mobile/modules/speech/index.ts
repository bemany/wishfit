import { requireNativeModule } from 'expo';

// On-device dictation. Only the recognised text leaves the phone, never the audio:
// recording and recognition run locally through Apple's Speech framework and nothing is stored.
export type Permission = 'granted' | 'denied' | 'undetermined';
export type SpeechModule = {
  requestPermissions(): Promise<Permission>;
  getPermissions(): Promise<Permission>;
  // Interim results arrive as the event `onResult`
  start(locale: string): Promise<void>;
  // Ends the session and returns the last text
  stop(): Promise<string>;
  addListener(event: 'onResult', cb: (e: { text: string; final: boolean }) => void): { remove(): void };
  addListener(event: 'onError', cb: (e: { message: string; code?: number }) => void): { remove(): void };
};

export default requireNativeModule<SpeechModule>('Speech');
