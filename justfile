set dotenv-load

# Cloudflare credentials (set these as environment variables)
CF_ZONE_ID := env_var_or_default("CF_ZONE_ID", "")
CF_API_TOKEN := env_var_or_default("CF_API_TOKEN", "")
CF_HOST := env_var_or_default("CF_HOST", "")

dev:
    npm run dev

# Static single-page bundle (served by any web server)
build:
  PUBLIC_SSR=no npm run build

# Server-rendered bundle (needs Node 22+ on the host, see deploy/squalk.service)
build-ssr:
  PUBLIC_SSR=yes npm run build

deploy target: build
  rsync -av --delete --progress build/ {{target}}:~/squalk/
  @just purge-web-cache

# Ships the Node build plus its runtime deps and env, then restarts the unit.
# The remote step runs in a login shell so the user's PATH (npm, nvm…) applies.
deploy-ssr target: build-ssr
  rsync -av --delete --progress --exclude node_modules build/ {{target}}:~/squalk/build/
  rsync -av package.json package-lock.json {{target}}:~/squalk/
  rsync -av .env.production {{target}}:~/squalk/.env
  ssh {{target}} '$SHELL -l -c "cd ~/squalk && npm ci --omit=dev && sudo systemctl restart squalk"'
  @just purge-web-cache

purge-web-cache:
  @echo "\nPurging Cloudflare cache... for zone {{CF_ZONE_ID}}"
  @curl -s -X POST "https://api.cloudflare.com/client/v4/zones/{{CF_ZONE_ID}}/purge_cache" \
        -H "Authorization: Bearer {{CF_API_TOKEN}}" \
        -H "Content-Type: application/json" \
        --data '{"purge_everything": true}' \
        | jq -r 'if .success then "✅ Cache purged successfully" else "‼️ Error: " + (.errors[0].message // "Unknown error") end'
