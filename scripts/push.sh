#!/usr/bin/env bash
# Durumu data branch'ine yaz (data.json + şifreli private.enc)
set -euo pipefail
REMOTE="${REMOTE:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
[ -n "${STATE_KEY:-}" ] || { echo "::error::STATE_KEY secret yok; durum şifrelenemez."; exit 1; }
node state.js enc
cp data.json state/data.json
cd state
git config user.name "amfi-bot"
git config user.email "bot@users.noreply.github.com"
git add -A
if git diff --cached --quiet; then echo "Değişiklik yok, push atlandı."; exit 0; fi
git commit -q -m "sync $(date -u +%FT%TZ)"
git push -q -f "$REMOTE" HEAD:data
echo "Durum kaydedildi."