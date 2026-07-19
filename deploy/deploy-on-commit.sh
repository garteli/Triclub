#!/usr/bin/env bash
# PostToolUse(Bash) hook: redeploy to Azure after a git commit that touched src/.
# Reads the hook JSON payload on stdin; no-ops unless a fresh commit changed src/.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

payload="$(cat)"
cmd="$(printf '%s' "$payload" | python -c 'import sys,json
try: print(json.load(sys.stdin).get("tool_input",{}).get("command",""))
except Exception: print("")' 2>/dev/null || true)"

# Only care about git commit invocations.
case "$cmd" in
  *"git commit"*) ;;
  *) exit 0 ;;
esac

cd "$ROOT" 2>/dev/null || exit 0
git rev-parse HEAD >/dev/null 2>&1 || exit 0

# Guard against "git commit" calls that created nothing (failed / empty):
# only proceed if HEAD was committed in the last 2 minutes.
ct="$(git log -1 --format=%ct 2>/dev/null || echo 0)"
now="$(date +%s)"
[ $(( now - ct )) -lt 120 ] || { echo "[deploy hook] no fresh commit — skipping"; exit 0; }

# Only deploy when the commit actually touched deployable source.
if ! git diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q '^src/'; then
  echo "[deploy hook] commit $(git rev-parse --short HEAD) didn't touch src/ — skipping deploy"
  exit 0
fi

sha="$(git rev-parse --short HEAD)"
log="$ROOT/deploy/last-deploy.log"
echo "[deploy hook] src/ changed in $sha — redeploying to Azure… (log: deploy/last-deploy.log)"
{
  echo "===== deploy for $sha at $(date -u +%Y-%m-%dT%H:%M:%SZ) ====="
  bash "$ROOT/deploy/publish-deploy.sh"
} >"$log" 2>&1
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "[deploy hook] DEPLOY FAILED for $sha (rc=$rc). Tail of deploy/last-deploy.log:"
  tail -n 15 "$log"
  exit 2   # asyncRewake: wake the model so a failed prod deploy isn't silent
fi
echo "[deploy hook] deployed $sha to Azure OK"
exit 0
