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
LAST=$(git log -1 --format=%ct 2>/dev/null || echo 0)
NOW=$(date +%s)
git add -A
if git diff --cached --quiet; then
  if [ $((NOW - LAST)) -lt 3300 ]; then echo "Değişiklik yok, push atlandı."; exit 0; fi
  date -u +%FT%TZ > heartbeat.txt; git add heartbeat.txt   # repo aktivitesi (zamanlanmış iş kapanmasın)
fi
git checkout -q --orphan tmp
git add -A
git commit -q -m "sync $(date -u +%FT%TZ)"
git branch -M data
git push -q -f "$REMOTE" data
echo "Durum kaydedildi."