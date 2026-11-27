import { Linking, Share } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { C } from './theme';

// Offers open in a browser sheet inside the app; if that is not possible, in the system browser
export const openLink = (url: string) =>
  WebBrowser.openBrowserAsync(url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: C.ink }).catch(() => Linking.openURL(url).catch(() => {}));

export const shareText = (message: string) => Share.share({ message }).catch(() => {});

// The system settings page of the app, where a refused permission can be granted again
export const canOpenSettings = true;
export const openSettings = () => Linking.openSettings();
