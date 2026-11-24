#!/usr/bin/env bash
# Durumu data branch'inden al (şifreli private.enc -> private.json + data.json)
set -euo pipefail
REMOTE="${REMOTE:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
rm -rf state
if git ls-remote --exit-code --heads "$REMOTE" data >/dev/null 2>&1; then
  git clone -q --depth 1 --branch data "$REMOTE" state
else
  mkdir state; git -C state init -q -b data; git -C state remote add origin "$REMOTE"
fi
if [ -s state/data.json ] && grep -q '"seats":{"' state/data.json && [ ! -f state/private.enc ]; then
  echo "::error::data.json dolu ama private.enc yok. Durum kaybı olmasın diye durduruldu."
  exit 1
fi
[ -f state/data.json ] && cp state/data.json data.json
if [ -f state/private.enc ]; then
  [ -n "${STATE_KEY:-}" ] || { echo "::error::STATE_KEY secret yok; şifreli durum çözülemez."; exit 1; }
  node state.js dec
  echo "Durum çözüldü ($(wc -c < private.json) bayt)."
else
  echo "Eski durum yok (ilk çalışma)."
fi