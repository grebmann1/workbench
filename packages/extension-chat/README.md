# Workbench Chat browser agent

Open Workbench Chat from the extension toolbar, configure an AI provider in **AI settings**, and choose a **Browser target**. Ask the agent to explain a page, organize its information, navigate, or work through a form. Browser access does not require a Salesforce connection. Salesforce tools and MCP servers remain available alongside browser tools; configure MCP servers in AI settings.

The target is captured when a prompt is submitted, including queued prompts. Switching Chrome tabs does not redirect a running task. Changing the target is disabled while any conversation is running. If a target closes, choose another page. Stop cancels pending steps; a click or navigation already sent to the browser cannot be undone.

## AI connections

In **AI settings**, choose **Sign in with ChatGPT** or **Sign in with Grok** to use the same subscription OAuth flow as the main extension. Finish in the provider popup. If it shows a code instead of returning, open **Having trouble returning?** and paste the code or callback URL. Connections save automatically; available subscription models appear in chat. If the provider returns no model list, enter a model name in its connection card.

**API keys & endpoints** contains OpenAI, Anthropic, Gemini, Mistral and xAI configuration. Sign out of an active subscription to use that provider's API key. API keys and tool changes use the header's **Save** button. **Connected tools** contains MCP configuration. Signing in or out preserves unsaved API/tool edits.

The chat worker reuses the main extension's PKCE, callback validation, token exchange and credential storage. Its manifest includes `webNavigation` for loopback callbacks, and its bundle includes the shared sign-in success page. The compact settings layout is opt-in through `assistant-style`; the original app keeps its existing layout.

## Approval mode

The chat header's **YOLO off / YOLO on** toggle controls tool approvals. It starts off and remembers your choice in this extension. With YOLO on, browser actions, Bash (including JavaScript), and connected MCP tools run without approval prompts. Tool calls and their results still appear in the conversation; **Stop** remains available, and questions that need your input still pause for an answer.

Change the mode while idle. Each request, including queued requests, keeps the mode selected when it was submitted. The original Workbench app retains its existing approval behavior. Page content cannot enable YOLO, and existing browser restrictions, sensitive-field protections, and target validation remain in force.

## Browser tools

| Tool               | Behavior                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `browser_tabs`     | List supported web tabs in the current window.                                               |
| `browser_snapshot` | Read viewport text, named controls, dropdown options, scroll position, and iframe locations. |
| `browser_navigate` | Navigate the target to HTTP(S), or move back/forward in its history.                         |
| `browser_click`    | Click an observed control.                                                                   |
| `browser_fill`     | Replace a native text input or textarea value; emit input/change events without submitting.  |
| `browser_select`   | Select an observed native dropdown value.                                                    |
| `browser_scroll`   | Scroll the page or an observed scroll container.                                             |

Reads run directly. Actions use Workbench's per-call approval flow when YOLO is off. Every page action consumes its snapshot and returns a new one. Navigation requires another snapshot once loading finishes. The runtime targets the observed Chrome document ID and rejects outdated references, changed field values, hidden/disabled controls, and covered click targets. Sensitive password, payment, one-time-code, file, and hidden inputs are not available for editing; their values are omitted from structured snapshots. Other page content is shared with the configured AI provider when a snapshot is requested.

## Boundaries

Structured snapshots cover the main document and open shadow roots. Scroll to read more of the page. They do not inspect iframe contents, closed shadow roots, canvas graphics, or Chrome's protected pages. Native DOM events work for ordinary controls; websites requiring trusted input, custom editors, or more advanced interactions can use the existing Puppeteer runtime, with per-call approvals when YOLO is off. These advanced tools retain their existing capabilities; the target selector is not an extension-wide security sandbox.

Page content is treated as untrusted input in the agent instructions. These instructions and the approval flow reduce risk but do not make arbitrary websites trustworthy. A tool returning successfully means the DOM action ran; business success still requires observed confirmation.

## Development and verification

The extension and toolbar icons come from `artwork/icon.svg`. Regenerate their PNG sizes with `node packages/extension-chat/artwork/generate-icons.mjs` after changing the source artwork. Both production and development builds use this branding.

Implementation lives in `src/browser/`. The chat bootstrap registers `chat.browserTabs` and `chat.browserTools` in the host command registry. The shared `agent-app` opts in with `browser-agent-enabled` and `browser-tab-id`; other hosts retain their defaults.

```sh
node --experimental-strip-types --import=./tools/testing/register.mjs --test packages/extension-chat/src/browser/__tests__/browserRuntime.test.js packages/lwc/main/agent/tools/modules/__tests__/toolPolicy.test.ts
npm run build:extension:chat:main
E2E_EXTENSION_TARGET=chat npx playwright test -c packages/tests-e2e/playwright.config.ts --project=extension browserAgent.spec.ts aiChat.spec.ts chatConnections.spec.ts --workers=1
npm run build:extension:main
```

The browser integration test uses a local intercepted fixture page and a simulated provider stream. Page interactions, extension messaging, approvals, rendering, and resulting DOM changes run in real Chromium without real credentials or external writes.
