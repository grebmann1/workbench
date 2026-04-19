#!/usr/bin/env bash
# Deploy to Heroku via the Container Registry.
# Run from the repo root: ./docker/deploy-heroku.sh
#
# What this script does (in order):
#   1. Validates that the Heroku CLI is installed and you are logged in.
#   2. Ensures the Heroku app is using the "container" stack.
#   3. Reads .env.prod and pushes every variable as a Heroku config var
#      (PORT is skipped — Heroku injects it automatically at runtime).
#   4. Runs docker/build.sh to compile all packages and build the Docker image.
#   5. Pushes the Docker image to the Heroku Container Registry.
#   6. Releases the image so the new dyno starts running it.
set -e

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP="workbench2"
ENV_FILE=".env.prod"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

# ---------------------------------------------------------------------------
# 1. Pre-flight checks
# ---------------------------------------------------------------------------
echo "==> [1/6] Checking Heroku CLI..."
if ! command -v heroku &>/dev/null; then
  echo "ERROR: Heroku CLI not found. Install it from https://devcenter.heroku.com/articles/heroku-cli"
  exit 1
fi

if ! heroku auth:whoami &>/dev/null; then
  echo "ERROR: Not logged in to Heroku. Run: heroku login"
  exit 1
fi
echo "     Logged in as: $(heroku auth:whoami)"

# ---------------------------------------------------------------------------
# 2. Ensure container stack
# ---------------------------------------------------------------------------
echo "==> [2/6] Setting Heroku stack to 'container' for app '$APP'..."
heroku stack:set container -a "$APP"

# ---------------------------------------------------------------------------
# 3. Sync .env.prod → Heroku config vars
# ---------------------------------------------------------------------------
echo "==> [3/6] Syncing config vars from $ENV_FILE to Heroku app '$APP'..."
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found in repo root."
  exit 1
fi

CONFIG_ARGS=()
while IFS= read -r line || [[ -n "$line" ]]; do
  # Skip blank lines and comments
  [[ -z "$line" || "$line" == \#* ]] && continue
  # Skip PORT — Heroku injects $PORT automatically; setting it breaks routing
  [[ "$line" == PORT=* ]] && continue
  # Strip surrounding single-quotes from values (e.g. KEY='value' → KEY=value)
  key="${line%%=*}"
  raw_value="${line#*=}"
  value="${raw_value//\'/}"
  CONFIG_ARGS+=("${key}=${value}")
done < "$ENV_FILE"

heroku config:set "${CONFIG_ARGS[@]}" -a "$APP"
echo "     Config vars updated."

# ---------------------------------------------------------------------------
# 4. Build all packages + Docker image
# ---------------------------------------------------------------------------
echo "==> [4/6] Running full build (docker/build.sh)..."
bash "$ROOT_DIR/docker/build.sh"

# ---------------------------------------------------------------------------
# 5. Push Docker image to Heroku Container Registry
# ---------------------------------------------------------------------------
echo "==> [5/6] Pushing Docker image to Heroku Container Registry..."
heroku container:push web -a "$APP"

# ---------------------------------------------------------------------------
# 6. Release the new image
# ---------------------------------------------------------------------------
echo "==> [6/6] Releasing image on Heroku..."
heroku container:release web -a "$APP"

echo ""
echo "Deployment complete!"
echo "App URL: https://$(heroku domains -a "$APP" --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');try{const j=JSON.parse(d);console.log(j[0]?.hostname||'$APP.herokuapp.com');}catch{console.log('$APP.herokuapp.com');}")"
