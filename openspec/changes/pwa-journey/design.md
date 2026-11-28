# Design
1. Plattform-Erkennung nur im Web (`Platform.OS === 'web'`): standalone über `matchMedia('(display-mode: standalone)')` oder `navigator.standalone`; iOS über UA/`maxTouchPoints`; Safari vs. andere iOS-Browser (CriOS/FxiOS/EdgiOS).
2. `beforeinstallprompt` früh (vor React) in index.html abfangen und in `window.__wfInstall` ablegen, damit das Ereignis nicht verloren geht.
3. Darstellung als Sheet im Gift-Tag-Stil (Schriften, Farben aus src/theme), Texte in i18n de/en. Natives iOS ist nicht betroffen (Datei-Endungen .web.tsx bzw. Platform-Weiche).
4. Merker in localStorage (`wishfit:installDismissedAt`).
5. Landingpage: `NEXT_PUBLIC_APP_URL` in apps/web/.env.example (nur Name), Fallback im Code. `/try` bleibt erreichbar, ist aber nicht mehr Haupt-Aufruf.
6. Die Landingpage deployt aus main über die Vercel-Git-Anbindung des Landing-Projekts (anderes Team); die Web-App per apps/mobile/scripts/deploy-web.sh.
