#!/usr/bin/env bash
set -euo pipefail

EXTENSION_URL="${WORKBENCH_CHROME_EXTENSION_URL:-https://chromewebstore.google.com/detail/salesforce-toolkit/konbmllgicfccombdckckakhnmejjoei?hl=en}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The initial Workbench DevBar addon supports macOS only."
  echo "$EXTENSION_URL"
  exit 0
fi

open "$EXTENSION_URL"

echo "Opened Workbench Chrome extension listing: $EXTENSION_URL"
