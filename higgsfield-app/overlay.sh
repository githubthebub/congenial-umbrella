#!/usr/bin/env bash
# Overlay the Darkroom port onto the Higgsfield website scaffold and push.
# Runs inside the Higgsfield sandbox (which can reach apps-repos.higgsfield.ai).
# Usage: HF_TOKEN=<scoped token> bash overlay.sh [branch]
set -euo pipefail

BRANCH="${1:-claude/instagram-alternative-viral-yx2hfj}"
RAW="https://raw.githubusercontent.com/githubthebub/congenial-umbrella/${BRANCH}/higgsfield-app"
REPO="https://apps-repos.higgsfield.ai/hfu-user36KNmFd6iH5Y3yk4Gh9GpEgWGDw/darkroom-50666e5a-5e11-4eca-81b2-f5bc695b9036.git"
DIR=/home/user/dk

if [ ! -d "$DIR/.git" ]; then
  git -c http.extraHeader="Authorization: token ${HF_TOKEN}" clone --depth 1 "$REPO" "$DIR"
fi
cd "$DIR"
git config user.email "agent@higgsfield.ai"
git config user.name "Higgsfield Agent"

fetch() { # fetch <raw-subpath> <dest>
  mkdir -p "$(dirname "app/$2")"
  curl -fsSL "$RAW/$1" -o "app/$2"
  echo "  + $2"
}

echo "overlaying files…"
fetch migrations/0002_darkroom.sql          migrations/0002_darkroom.sql
fetch src/lib/api/darkroom.functions.ts     src/lib/api/darkroom.functions.ts
fetch src/darkroom.css                      src/darkroom.css
fetch src/routes/index.tsx                  src/routes/index.tsx
fetch src/app-meta.json                     src/app-meta.json
fetch app.manifest.json                     app.manifest.json
fetch design-brief.md                       design-brief.md

# Wire the app stylesheet into the Tailwind entry exactly once.
if ! grep -q 'darkroom.css' app/src/styles.css; then
  sed -i 's|@import "tw-animate-css";|@import "tw-animate-css";\n@import "./darkroom.css";|' app/src/styles.css
  echo "  ~ styles.css: added @import ./darkroom.css"
fi

echo "gate checks…"
if grep -rn "REMOVE_THIS\|blank-app-v1\|lorem ipsum" app/src --include='*.tsx' --include='*.ts'; then
  echo "✗ placeholder marker still present"; exit 1
fi
echo "  ✓ no placeholders"

git add -A
git commit -m "Darkroom: four-person blind film roll with synced D1 backend"
git -c http.extraHeader="Authorization: token ${HF_TOKEN}" push origin main
echo "pushed."
