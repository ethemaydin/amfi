#!/usr/bin/env bash
set -e
REMOTE="${REMOTE:-https://x-access-token:${GH_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
node state.js enc
cp data.json state/data.json
cd state
git config user.name "amfi-bot"; git config user.email "bot@users.noreply.github.com"
git checkout -q --orphan tmp
git add -A
git commit -q -m "sync $(date -u +%FT%TZ)"
git branch -M data
git push -q -f "$REMOTE" data
