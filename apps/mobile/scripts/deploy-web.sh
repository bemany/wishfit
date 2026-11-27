#!/usr/bin/env bash
# Export the Expo app as a PWA and deploy it to the Vercel project wishfit-web-test (team fahrer-app).
# Token: VERCEL_TOKEN or the file ~/.config/vercel/token. API: EXPO_PUBLIC_API_URL (default: test backend).
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${VERCEL_TOKEN:-$(cat "$HOME/.config/vercel/token")}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://wishfit-agent-test.vercel.app}"

rm -rf dist
npx expo export -p web --output-dir dist

# Vercel drops every node_modules folder on upload, but Expo puts the font files in assets/node_modules
if [ -d dist/assets/node_modules ]; then
  mv dist/assets/node_modules dist/assets/vendor
  grep -rl "assets/node_modules" dist --include='*.js' --include='*.css' --include='*.html' | xargs sed -i.bak 's#assets/node_modules#assets/vendor#g'
  find dist -name '*.bak' -delete
fi

cat > dist/vercel.json <<'JSON'
{
  "rewrites": [{ "source": "/((?!_expo/|assets/|.*\\..*).*)", "destination": "/index.html" }],
  "headers": [
    { "source": "/sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }, { "key": "Service-Worker-Allowed", "value": "/" }] },
    { "source": "/manifest.webmanifest", "headers": [{ "key": "Cache-Control", "value": "no-cache" }, { "key": "Content-Type", "value": "application/manifest+json" }] },
    { "source": "/index.html", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
    { "source": "/_expo/static/(.*)", "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }] }
  ]
}
JSON

# --name creates/links the project on the first run; --scope is the team
npx -y vercel@latest deploy dist --prod --yes --name wishfit-web-test --scope fahrer-app --token "$TOKEN"
