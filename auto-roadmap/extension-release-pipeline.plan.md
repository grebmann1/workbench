---
name: extension-release-pipeline
overview: "Wire up the Chrome Web Store auto-publish workflow for the core Workbench extension. Workflow file (.github/workflows/extension-release.yml) is already committed: triggers on extension-v* tags, builds via npm run build:prod:extension, zips dist/extension/, uploads as workflow artifact (30-day retention), and pushes to CWS as a draft (publish: false). Remaining work is one-time credential setup and a smoke-test release."
todos:
    - id: get-extension-id
      content: "Grab CHROME_EXTENSION_ID from the Chrome Web Store Developer Dashboard (URL or page header — 32-char string)"
      status: pending
    - id: gcloud-project-and-api
      content: "In Google Cloud Console: create/select a project, enable the Chrome Web Store API (APIs & Services → Library)"
      status: pending
    - id: gcloud-oauth-consent
      content: "Configure OAuth consent screen as External, leave in Testing mode, add the CWS-owner Google account as a test user (avoids verification flow)"
      status: pending
    - id: gcloud-oauth-client
      content: "Create OAuth client ID, application type Desktop app — capture CHROME_CLIENT_ID and CHROME_CLIENT_SECRET"
      status: pending
    - id: get-refresh-token
      content: "Generate CHROME_REFRESH_TOKEN: open https://accounts.google.com/o/oauth2/auth?response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&client_id=CLIENT_ID&redirect_uri=urn:ietf:wg:oauth:2.0:oob signed in as the CWS owner, get the auth code, exchange via curl POST to https://accounts.google.com/o/oauth2/token (grant_type=authorization_code). Refresh token field is what to save. Auth code is single-use and expires ~10 min"
      status: pending
    - id: add-github-secrets
      content: "Add all four secrets to repo (Settings → Secrets and variables → Actions): CHROME_EXTENSION_ID, CHROME_CLIENT_ID, CHROME_CLIENT_SECRET, CHROME_REFRESH_TOKEN. Also confirm WORKBENCH_VSCODE_URL, WORKBENCH_BASE_URL, GOOGLE_CLIENT_ID_EXTENSION are present (build-time env)"
      status: pending
    - id: smoke-test-release
      content: "Bump root package.json version, commit, tag extension-vX.Y.Z, push tag. Verify: workflow runs green, workbench-extension-X.Y.Z.zip artifact attached, draft appears in CWS dashboard. Then publish manually from CWS for the first round to validate the package contents"
      status: pending
    - id: optional-auto-publish
      content: "Optional later: flip publish: true in extension-release.yml once the draft flow has been validated a few times. Keep draft mode if you want a manual review gate before each rollout"
      status: pending
    - id: optional-chat-extension-workflow
      content: "Optional later: clone the same workflow for packages/extension-chat (separate CWS listing, separate extension-chat-v* tag, separate CHROME_EXTENSION_ID secret). Same OAuth client/refresh token can be reused since they're per-Google-account, not per-extension"
      status: pending
notes: |
    - Workflow file already exists at .github/workflows/extension-release.yml (committed).
    - The OAuth client ID/secret and refresh token are reusable across all extensions owned by the same Google account — only CHROME_EXTENSION_ID is per-extension.
    - Refresh token stays valid as long as the consent screen remains Testing + account remains a test user (or the consent screen gets published). Rotating client secret invalidates it.
    - mnao305/chrome-extension-upload@v5.0.0 is pinned by version; bump deliberately.
