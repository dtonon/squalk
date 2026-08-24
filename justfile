set dotenv-load

# Cloudflare credentials: per deploy target in .env.<mode>.local (gitignored,
# never shipped to the server), falling back to the environment / .env

dev:
    npm run dev

# Static single-page bundle (served by any web server)
build:
  PUBLIC_SSR=no npm run build

# Server-rendered bundle (needs Node 22+ on the host, see deploy/production-example.service)
build-ssr:
  PUBLIC_SSR=yes npm run build

deploy target: build
  rsync -av --delete --progress build/ {{target}}:~/squalk/
  @just purge-web-cache

# Ships the Node build plus its runtime deps and env, then restarts the unit.
# `mode` picks the instance: vite bakes .env.<mode> into the build, and
# .env.<mode>.local provides the deployment details (DEPLOY_HOST, DEPLOY_DIR,
# DEPLOY_SERVICE) plus the Cloudflare credentials. The remote step runs in a
# login shell so the user's PATH (npm, nvm…) applies.
deploy-ssr mode:
  #!/usr/bin/env bash
  set -euo pipefail
  [ -f .env.{{mode}}.local ] || { echo "Missing .env.{{mode}}.local"; exit 1; }
  set -a; source .env.{{mode}}.local; set +a
  : "${DEPLOY_HOST:?DEPLOY_HOST missing in .env.{{mode}}.local}"
  : "${DEPLOY_DIR:?DEPLOY_DIR missing in .env.{{mode}}.local}"
  : "${DEPLOY_SERVICE:?DEPLOY_SERVICE missing in .env.{{mode}}.local}"
  PUBLIC_SSR=yes npm run build -- --mode {{mode}}
  rsync -av --delete --progress --exclude node_modules build/ "$DEPLOY_HOST:$DEPLOY_DIR/build/"
  rsync -av package.json package-lock.json "$DEPLOY_HOST:$DEPLOY_DIR/"
  rsync -av .env.{{mode}} "$DEPLOY_HOST:$DEPLOY_DIR/.env"
  ssh "$DEPLOY_HOST" "\$SHELL -l -c 'cd $DEPLOY_DIR && npm ci --omit=dev && sudo systemctl restart $DEPLOY_SERVICE'"
  just purge-web-cache {{mode}}

purge-web-cache mode="production":
  #!/usr/bin/env bash
  if [ -f .env.{{mode}}.local ]; then set -a; source .env.{{mode}}.local; set +a; fi
  echo -e "\nPurging Cloudflare cache... for zone ${CF_ZONE_ID:-<unset>}"
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID:-}/purge_cache" \
        -H "Authorization: Bearer ${CF_API_TOKEN:-}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything": true}' \
        | jq -r 'if .success then "✅ Cache purged successfully" else "‼️ Error: " + (.errors[0].message // "Unknown error") end'
