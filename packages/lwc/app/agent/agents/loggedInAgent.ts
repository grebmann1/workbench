import { tools } from 'agent/tools';
const { Agent } = window.OpenAIAgentsBundle?.Agents || {};
import { promptWithHandoffInstructions, isChromeExtension, isUndefinedOrNull } from 'shared/utils';
import { store } from 'core/store';

import { sharedInstructions } from './instructions/sharedInstructions';

const loggedInRoleBlock = `
## Additional Responsibilities (Logged In)
- **Toolkit & Org Actions:**
  - You can access and interact with Salesforce data and tools (SOQL, Apex, API, connections, etc.).
  - Always verify the user's context and org connection before performing sensitive actions.
  - Use Workbench actions as your primary tools for org and data operations.
- **Example Flows:**
  - If the user says: "Run a SOQL query" → Use the SOQL tools and present the results.
  - If the user says: "Write an Apex Script" → Use the Apex tools and present the results.
  - If the user says: "Open my org" → Use the org navigation tools.
  - If the user asks to navigate or automate the current webpage, hand off to BrowserAgent.
  - If the user asks: "What is SOQL?" → Answer directly using your available tools.
`;

function buildEnvironmentBlock(): string {
    const state = store.getState();
    const isSidePanel = state.application?.isSidePanel ?? false;
    const connector = state.application?.connector ?? null;
    const currentApplication = state.application?.currentApplication ?? null;
    const loginStatus = connector
        ? `Connected org: ${connector.toPublic?.()?.alias ?? connector.toPublic?.()?.instanceUrl ?? 'unknown'}`
        : 'Not connected to any Salesforce org.';
    const appLine = currentApplication ? `\nCurrently visible panel: ${currentApplication}` : '';

    if (isSidePanel) {
        return `

## Environment Context

**Running in: Chrome Side Panel**

${loginStatus}${appLine}

Prefer background/incognito tools (soql_query_incognito, sf data query, sf apex run --no-ui, sf api request). UI navigation tools dispatch to the store but the Toolkit tab is not visible. Use connect_org to open the Toolkit in a new tab.
`;
    }
    return `

## Environment Context

**Running in: SF Toolkit Web App**

${loginStatus}${appLine}

All UI navigation and display tools work normally. Use navigation tools freely to show results in the relevant panel.
`;
}

export function createLoggedInAgent({ toolsOverride } = {}) {
    if (isUndefinedOrNull(Agent)) return null;
    return new Agent({
        name: 'Workbench Assistant (Logged In)',
        instructions: runContext =>
            promptWithHandoffInstructions(`${sharedInstructions}
${loggedInRoleBlock}
${buildEnvironmentBlock()}
${runContext?.dynamicContext ?? ''}`),
        tools: Array.isArray(toolsOverride)
            ? toolsOverride
            : [
                  ...tools.soql,
                  ...tools.apex,
                  ...tools.api,
                  ...tools.connections,
                  ...tools.general,
                  ...tools.agent,
                  ...(isChromeExtension() ? tools.chrome : []),
              ],
        toolUseBehavior: { stopAtToolNames: ['chrome_screenshot'] },
        modelSettings: {
            toolChoice: 'auto',
            truncation: 'auto',
            parallelToolCalls: false,
        },
    });
}
