export type EnvironmentTabInfo = {
    id?: number | null;
    title?: string | null;
    url?: string | null;
} | null;

export type EnvironmentContextInput = {
    isSidePanel: boolean;
    loginStatus: string;
    currentApplication: string | null;
    currentTab?: EnvironmentTabInfo;
};

function formatCurrentTabBlock(currentTab?: EnvironmentTabInfo): string {
    const tabId = currentTab?.id;
    if (typeof tabId !== 'number') {
        return `The user's visible browser tab was not resolved at prompt time. Call \`listTabs()\`, pick the \`active\` tab (or match by title/url), then \`connectToPage(tab.id)\`.`;
    }
    const title = currentTab?.title?.trim() || '(untitled)';
    const url = currentTab?.url?.trim() || '(unknown url)';
    return `User's visible browser tab (the page beside this side panel):
- id: ${tabId}
- title: ${title}
- url: ${url}

When the user refers to "this tab", "the current page", a quiz, or visible page content, inspect THAT tab:
\`\`\`javascript
const tabs = await listTabs();
const tab = tabs.find(t => t.id === ${tabId}) || tabs.find(t => t.active) || tabs[0];
const page = await connectToPage(tab.id);
const snapshot = await getSnapshot(page);
\`\`\`
You may also call \`connectToPage()\` with no argument to attach to the active tab.

Use top-level \`await\` as shown. Do **not** wrap this in an extra \`(async () => { ... })()\` — that returns immediately with empty output. \`getSnapshot(page)\` returns ARIA YAML (a string); \`console.log(snapshot)\` to inspect it.`;
}

export function buildRunningEnvironmentContext(input: EnvironmentContextInput): string {
    const { isSidePanel, loginStatus, currentApplication, currentTab } = input;
    const appLine = currentApplication ? `\nCurrently visible panel: ${currentApplication}` : '';

    if (isSidePanel) {
        return `

## Environment Context

**Running in: Chrome Side Panel**

${loginStatus}${appLine}

You are running inside the Chrome Side Panel, which is a narrow overlay beside the browser — the SF Toolkit LWC app is **not** the visible tab. This has important consequences for UI tools:

**Avoid UI-navigation tools** unless the user explicitly asks to open the Toolkit app:
- \`navigate_workbench_app\`, \`sf navigate\`, \`soql_query\` (with UI), \`apex_navigate\`, \`metadata_navigate\`, \`navigateToApiEditor\` — these dispatch to the store and will take effect once the user switches to the Toolkit tab, but they produce no immediate visible feedback.

**Prefer background/incognito tools** — they work reliably from the side panel without touching the UI:
- \`soql_query_incognito\` instead of \`soql_query\`
- \`sf data query\` for SOQL
- \`sf apex run --no-ui\` or \`apex_execute\` for Apex (\`--no-ui\` runs incognito and does not create/update Apex tabs)
- For UI runs, reuse the last returned \`tabId\` via \`sf apex run --tab-id <tabId>\` to avoid creating a new tab each time
- \`sf api request\` for REST API calls
- \`sf metadata list-types / list-records / deploy / retrieve\` for metadata operations
- \`metadata_list_types\`, \`metadata_list_records\`, \`metadata_get_record\` (all incognito)

**Connecting to a new org** via \`connect_org\` or \`sf org connect\` will open the full Toolkit in a new browser tab.

## Inspecting the current browser tab

${formatCurrentTabBlock(currentTab)}

There are **no** agent tools named \`chrome_screenshot\`, \`chrome_list_tabs\`, or \`chrome_open_tab\`. Use the sandboxed \`js\` command with \`listTabs()\`, \`connectToPage(tabId)\`, \`getSnapshot(page)\`, and \`logImage(...)\`.
Do **not** call \`createTab()\` to inspect a page the user already has open.
`;
    }

    return `

## Environment Context

**Running in: SF Toolkit Web App**

${loginStatus}${appLine}

You have full access to the toolkit UI. All navigation and display tools work normally:
- Navigation tools (\`navigate_workbench_app\`, \`sf navigate\`, \`apex_navigate\`, etc.) update the visible UI in real time.
- Tab management tools open and switch visible editor panels.
- Use \`soql_query\` (not incognito) to show results in the SOQL editor for the user.
- Use incognito variants (\`soql_query_incognito\`, \`sf data query\`) when you need data silently without navigating away.
`;
}
