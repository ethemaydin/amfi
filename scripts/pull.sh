#!/usr/bin/env bash
set -e
REMOTE="${REMOTE:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
rm -rf state
if git ls-remote --exit-code --heads "$REMOTE" data >/dev/null 2>&1; then
  git clone -q --depth 1 --branch data "$REMOTE" state
else
  mkdir state; git -C state init -q -b data; git -C state remote add origin "$REMOTE"
fi
if [ -s state/data.json ] && grep -q '"seats":{"' state/data.json && [ ! -f state/private.enc ]; then
  echo "UYARI: data.json dolu ama private.enc yok. Durum kaybı olmaması için durduruldu."; exit 1
fi
if [ -f state/data.json ]; then cp state/data.json data.json; fi
if [ -f state/private.enc ]; then node state.js dec; fi
