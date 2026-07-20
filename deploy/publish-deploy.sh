#!/usr/bin/env bash
# Publish Squad.Web and deploy it to the Azure App Service `triclub`.
#
# Uses the method that actually lands files (OneDeploy `az webapp deploy --type zip`
# reported success but did NOT replace the DLLs — see the azure-hosting memory):
#   dotnet publish -> python zipfile -> POST {scm}/api/zipdeploy?isAsync=false -> restart.
#
# Usage: deploy/publish-deploy.sh
# Requires: dotnet, python, curl, and an authenticated `az` (Azure CLI).
set -euo pipefail

RG=triclub
APP=triclub
SCM="https://triclub-epcjf6hxaaaed6b3.scm.canadacentral-01.azurewebsites.net"
BASE="https://triclub-epcjf6hxaaaed6b3.canadacentral-01.azurewebsites.net"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PUB="$(mktemp -d)/pub"
ZIP="$(mktemp -d)/app.zip"

export PATH="$PATH:/c/Program Files/Microsoft SDKs/Azure/CLI2/wbin"

# Build the SPA to completion FIRST, then publish with the in-build client step disabled.
# Otherwise the BuildClientApp target runs `npm run build` (emptyOutDir) *during* publish and
# rewrites wwwroot with fresh vite hashes mid-flight — while StaticWebAssets is resolving the
# assets it globbed a moment earlier — which fails non-deterministically with
# "No file exists for the asset …/base-<hash>.js". Building client-then-publish keeps wwwroot
# static across the publish. Wiping obj/bin also clears any stale StaticWebAssets manifest.
echo "==> clean intermediate + build SPA (before publish, to avoid the wwwroot race)"
rm -rf "$ROOT/src/Squad.Web/obj" "$ROOT/src/Squad.Web/bin"
( cd "$ROOT/src/Squad.Client" && npm run build )

echo "==> dotnet publish (SPA already built)"
dotnet publish "$ROOT/src/Squad.Web" -c Release -p:SkipClientBuild=true -o "$PUB" --nologo -v q

echo "==> zip (python zipfile)"
python "$ROOT/deploy/mkzip.py" "$PUB" "$ZIP"

echo "==> fetch publishing credentials"
creds=$(az webapp deployment list-publishing-credentials -g "$RG" -n "$APP" \
  --query "{u:publishingUserName,p:publishingPassword}" -o tsv)
U=$(echo "$creds" | cut -f1); P=$(echo "$creds" | cut -f2)

echo "==> zipdeploy (sync)"
code=$(curl -s -u "$U:$P" -X POST --data-binary @"$ZIP" \
  -H "Content-Type: application/zip" --max-time 300 \
  "$SCM/api/zipdeploy?isAsync=false" -w "%{http_code}" -o /dev/null)
echo "    zipdeploy HTTP $code"
[ "$code" = "200" ] || { echo "!! zipdeploy failed"; exit 1; }

echo "==> restart"
az webapp restart -g "$RG" -n "$APP" >/dev/null

echo "==> warm + health check (cold start ~60-80s; first DB hit is slow)"
for i in $(seq 1 20); do
  hc=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/api/health" || true)
  [ "$hc" = "200" ] && { echo "    healthy after $i checks"; break; }
  sleep 6
done

echo "==> DONE: deployed to $BASE"
