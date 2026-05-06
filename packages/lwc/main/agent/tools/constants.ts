export const SHELL_TOOL_HELP = {
    js: `Execute JavaScript in the sandbox with Puppeteer browser automation and filesystem access.
Use 'return' to get a result back.

Usage:
  js -e '<code>'              Inline code (like node -e)
  js <file>                    Run a script file from the filesystem
  js --timeout 30000 -e '...'  Custom timeout (default: 10000ms)
  js --help                    Show this help

Available globals: connectToPage(tabId), getSnapshot(page), getElementByRef(page, ref), clearInput(handle),
readFile(path), writeFile(path), listFiles(path), bash(command), logImage(base64), workspace.status(), etc.`,
    saveSkill: `Save a skill to the workspace.

Usage:
  save-skill --name <name> --description "<desc>" --content "<body>"
  save-skill --name <name> --description "<desc>" --file <path>
  save-skill --name <name> --description "<desc>" --content @<path>
  save-skill --name <name> --description "<desc>" --file <path> --scope user --overwrite

Notes:
  - name must be letters, numbers, hyphens, or underscores.
  - content is the SKILL.md body (frontmatter is added automatically).
  - scope defaults to project (saved under /workspace/skills).`,
    bashIntro: 'Execute bash commands in the sandbox environment.',
    useRelativePaths: 'Use relative paths from here.',
    availableFilesLabel: 'Available files:',
    customCommands:
        "Custom commands: js -e '<code>', js <file>, open <file>, save-skill, web-search, sf apex run, sf apex test run, sf data query, sf api request, sf org list, sf org connect, sf org open, sf navigate, sf debug log enable|list|get, sf limits display, sf sobject describe, sf metadata list-types, sf metadata list-records, sf metadata deploy|retrieve. Most sf commands accept --target-org <alias> to run against a different org.",
    customCommandsNoBrowser:
        'Custom commands: save-skill, web-search, sf apex run, sf apex test run, sf data query, sf api request, sf org list, sf org connect, sf org open, sf navigate, sf debug log enable|list|get, sf limits display, sf sobject describe, sf metadata list-types, sf metadata list-records, sf metadata deploy|retrieve. Browser automation commands such as js and open are unavailable in this environment. Most sf commands accept --target-org <alias> to run against a different org.',
    sfCliShimsHelp: 'SF CLI shims help:',
    webSearch: `Search the internet using Bright Data's SERP API.

Usage:
  web-search "your query"
  web-search --query "your query"
  web-search -q "your query" --country us
  web-search -q "your query" --zone my_serp_zone
  web-search --help

Options:
  -q, --query    Search query (required)
  --country, -c  Two-letter country code for results (e.g. us, gb, fr)
  --zone, -z     Bright Data SERP zone name (default: serp_api1)

Returns structured JSON from Google Search via Bright Data.`,
} as const;

export const TOOL_OUTPUT_LIMITS = {
    maxChars: 30000,
    tailChars: 2000,
    directory: '/tmp/tool-outputs',
    truncatedMarker: '[OUTPUT TRUNCATED]',
    pageSize: 200,
    sectionSeparator: '\n\n',
    sectionContentSeparator: '\n',
    existingCapSlackChars: 1024,
} as const;

export const SKILL_PATH_TEMPLATES = [
    '/workspace/skills/custom-skills/{name}/SKILL.md',
    '/workspace/.cursor/skills/{name}/SKILL.md',
    '/workspace/skills/{name}/SKILL.md',
    '/workspace/skills/professional/{name}/SKILL.md',
    '/workspace/skills/general/{name}.SKILL.md',
] as const;

export const MODEL_FAMILY_TOOL_TYPES = {
    'gpt-5-mini': ['web_search', 'web_search_preview', 'code_interpreter', 'file_search', 'mcp'],
    'gpt-5-nano': ['web_search', 'web_search_preview', 'code_interpreter', 'file_search', 'mcp'],
    'gpt-5': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'gpt-5-codex': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'gpt-5.2': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'gpt-5.4': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'shell',
        'computer_use_preview',
        'tool_search',
        'apply_patch',
        'file_search',
        'skills',
        'mcp',
    ],
    'gpt-4.1': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'gpt-4.1-mini': ['web_search', 'web_search_preview', 'code_interpreter', 'file_search', 'mcp'],
    'gpt-4.1-nano': ['web_search', 'web_search_preview', 'code_interpreter', 'file_search', 'mcp'],
    'gpt-4o': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    o1: [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'o1-mini': ['web_search', 'web_search_preview', 'code_interpreter', 'file_search', 'mcp'],
    'o1-pro': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'shell',
        'computer_use_preview',
        'tool_search',
        'apply_patch',
        'file_search',
        'skills',
        'mcp',
    ],
    o3: [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'shell',
        'computer_use_preview',
        'tool_search',
        'apply_patch',
        'file_search',
        'skills',
        'mcp',
    ],
    'o3-mini': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
    'o3-pro': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'shell',
        'computer_use_preview',
        'tool_search',
        'apply_patch',
        'file_search',
        'skills',
        'mcp',
    ],
    'o4-mini': [
        'web_search',
        'web_search_preview',
        'code_interpreter',
        'image_generation',
        'file_search',
        'mcp',
    ],
} as const;

export const AGENT_TOOL_CONFIG = {
    askUser: {
        name: 'ask_user',
        description: `Present the user with a multiple-choice question when you need them to pick from a bounded set of options (e.g. file format, target org, action to take, yes/no decisions).

ONLY call this tool when you have a predefined list of options for the user to choose from.
Do NOT call this tool for open-ended questions where the user needs to type a free-text answer — in that case, ask directly in your response message instead.

Wait for the user's selection before continuing.`,
        descriptionDescription:
            'Short label (≤ 60 chars) summarising what you are asking, shown in the chat UI (e.g. "Choose export format", "Select target org").',
        questionDescription: 'The question to present to the user.',
        optionsDescription:
            'Required list of answer choices the user can select from. Must contain at least two options.',
        skippedAnswer: 'The user skipped this question.',
        answerPrefix: "User's answer: ",
    },
} as const;

export const TOOL_APP_NAMES = {
    apex: 'anonymousapex',
    api: 'api',
    metadata: 'metadata',
    soql: 'soql',
} as const;

export const CONNECTION_TOOL_DESCRIPTIONS = {
    listConnections:
        'List all Salesforce org connections (aliases, usernames, etc.) available in the toolkit.',
    connectOrg: `Connect to a Salesforce org. 

    ## Instructions:
    - Set Redirect to a specific application (applicationName=api) to open a specific application but by default you can keep it null

    ## Applications available:
        - api: Open the API Explorer
        - soql: Open the SOQL Editor
        - anonymousApex: Open the Anonymous Apex Editor
        - agent: Open the Agent
        - connections: Open the Connections
        - settings: Open the Settings
        - accessAnalyzer: Open the Access Analyzer
        - org: Open the Org. Overview
        - code: Open the Code Toolkit
        - metadata: Open the Metadata Explorer
        - object: Open the SObject Explorer
        - doc: Open the Documentation
        - recordViewer: Open the Record Viewer
        - platformevent: Open the Event Explorer
        - package: Open the Deploy/Retrieve
        - assistant: Open the AI Assistant
        - settings: Open the Settings
        - release: Open the Release Notes
    `,
    connectRedirect: 'The redirect url to open (applicationName=api)',
    disconnectOrg: 'Disconnect from the current Salesforce org (removes session).',
    navigateToOrg:
        'Navigate to a Salesforce org. Redirect is optional and can be used to open a specific page/application specific to salesforce.',
} as const;

export const GENERAL_TOOL_DESCRIPTIONS = {
    currentApplication: 'Get the current application name in the toolkit.',
    currentConnection: 'Get the current user/connection information.',
    checkLoggedIn: 'Check if the user is logged in.',
} as const;

export const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-_]*$/i;

export const SKILL_ROOT_DIR_BY_SCOPE = {
    project: '/workspace/skills/custom-skills',
    user: '/workspace/.cursor/skills',
} as const;
