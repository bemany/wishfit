#!/usr/bin/env bash
# Export the Expo app as a PWA and deploy it to the Vercel project wishfit-web-test (team fahrer-app).
# Token: VERCEL_TOKEN or the file ~/.config/vercel/token. API: EXPO_PUBLIC_API_URL (default: test backend).
set -euo pipefail
cd "$(dirname "$0")/.."

TOKEN="${VERCEL_TOKEN:-$(cat "$HOME/.config/vercel/token")}"
export EXPO_PUBLIC_API_URL="${EXPO_PUBLIC_API_URL:-https://wishfit-agent-test.vercel.app}"

rm -rf dist
npx expo export -p web --output-dir dist

# Vercel drops every node_modules folder on upload, but Expo puts the font files under assets/.../node_modules
# (assets/node_modules, or assets/____<dir>/.../node_modules when node_modules lies outside the project, e.g. a
# symlink in a worktree). Move each one to assets/vendor and rewrite the paths in the bundle.
while IFS= read -r dir; do
  rel="${dir#dist/}"
  mkdir -p dist/assets/vendor
  cp -R "$dir"/. dist/assets/vendor/
  rm -rf "$dir"
  grep -rl "$rel" dist --include='*.js' --include='*.css' --include='*.html' | xargs sed -i.bak "s#$rel#assets/vendor#g"
  find dist -name '*.bak' -delete
done < <(find dist/assets -type d -name node_modules -prune | sort)
find dist/assets -type d -empty -delete
if grep -rqo 'assets/[^"]*node_modules' dist --include='*.js' --include='*.css' --include='*.html'; then
  echo "asset paths with node_modules are left in the bundle; Vercel would serve 404 for them" >&2
  exit 1
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

# every font in the bundle must load on the live site
BASE=https://wishfit-web-test.vercel.app
for f in $(grep -rhoE '/assets/[^"]+\.ttf' dist --include='*.js' | sort -u); do
  # the alias needs a few seconds to point at the new deployment
  for _ in 1 2 3 4 5 6; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE$f")
    [ "$code" = 200 ] && break
    sleep 10
  done
  [ "$code" = 200 ] || { echo "font $f answers $code" >&2; exit 1; }
done
echo "fonts ok"
