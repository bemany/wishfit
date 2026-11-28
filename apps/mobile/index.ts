import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import { captureAttribution } from './src/attribution';
import { impersonation } from './src/impersonation';

// where a new user came from, read before the app changes the address (web; a no-op in the native app)
captureAttribution();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Web only: the service worker keeps the app shell for an offline start
// Not in the admin simulator, which is a view inside the console
if (Platform.OS === 'web' && !impersonation && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
