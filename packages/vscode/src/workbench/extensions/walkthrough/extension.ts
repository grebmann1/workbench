import { buildOrgContext, ORG_ENVIRONMENT_TYPES } from '../../connection/orgContext';
import { getWorkbenchOrgContext } from '../../platform/workbenchServices';
import { EXTENSION_PUBLISHER } from '../core/constants';
import { buildSalesforceExtensionConfig } from '../core/extensionManifest';
import {
    createCallbackDisposable,
    registerSalesforceExtension,
    type VscodeBundle,
} from '../core/extensionRegistration';

const WALKTHROUGH_EXTENSION_NAME = 'workbench-walkthrough';
const WALKTHROUGH_EXTENSION_ID = `${EXTENSION_PUBLISHER}.${WALKTHROUGH_EXTENSION_NAME}`;

export type WalkthroughVscodeBundle = VscodeBundle & {
    vscodeApiMonaco: { ContextKeyExpr: { true(): unknown } };
    vscodeApi: {
        getService: (id: unknown) => Promise<{
            registerWalkthrough: (w: unknown) => void;
            unregisterWalkthrough: (w: unknown) => void;
        }>;
        IWalkthroughsService: unknown;
    };
};

type OrgContextInput = Record<string, unknown>;

function buildOrgIntro(orgContext: OrgContextInput) {
    if (!orgContext.hasConnection) {
        return 'This workbench needs a Salesforce connection from the parent toolkit session before metadata commands can run.';
    }

    switch (orgContext.environmentType) {
        case ORG_ENVIRONMENT_TYPES.production:
            return 'This is a **production org**, so review changes carefully before syncing or deploying.';
        case ORG_ENVIRONMENT_TYPES.sandbox:
            return 'This is a **sandbox org**, so it is safer for exploration and testing.';
        case ORG_ENVIRONMENT_TYPES.scratch:
            return 'This is a **scratch org**, so it is intended for short-lived development, validation, and disposable experiments.';
        case ORG_ENVIRONMENT_TYPES.trailhead:
            return 'This is a **Trailhead org**, so it is intended for learning, guided exercises, and experimentation.';
        case ORG_ENVIRONMENT_TYPES.dev:
            return 'This is a **dev org**, so it is intended for local development and isolated testing.';
        default:
            return 'The org type could not be confirmed automatically, so treat changes with care.';
    }
}

export function buildWalkthroughMarkdown(orgContext: OrgContextInput): string {
    const hostLine = orgContext.host ? `- Host: \`${orgContext.host}\`\n` : '';
    const orgNameLine = orgContext.organizationName
        ? `- Organization: **${orgContext.organizationName}**\n`
        : '';
    const usernameLine = orgContext.username ? `- Username: \`${orgContext.username}\`\n` : '';
    const orgIdLine = orgContext.orgId ? `- Org Id: \`${orgContext.orgId}\`\n` : '';
    const environmentWarning =
        orgContext.environmentType === ORG_ENVIRONMENT_TYPES.production
            ? 'Because this is a **production org**, make changes carefully and review anything that could affect live users or data before you sync, retrieve, or deploy.'
            : orgContext.environmentType === ORG_ENVIRONMENT_TYPES.sandbox
              ? 'Because this is a **sandbox org**, this environment is better suited for exploration, validation, and trying workflows before touching production.'
              : orgContext.environmentType === ORG_ENVIRONMENT_TYPES.scratch
                ? 'Because this is a **scratch org**, this environment is best suited for short-lived development, verification, and disposable experiments.'
                : orgContext.environmentType === ORG_ENVIRONMENT_TYPES.trailhead
                  ? 'Because this is a **Trailhead org**, this environment is best suited for learning, hands-on exercises, and experimentation rather than production-like workflows.'
                  : orgContext.environmentType === ORG_ENVIRONMENT_TYPES.dev
                    ? 'Because this is a **dev org**, this environment is best suited for local development, debugging, and isolated validation.'
                    : 'Because the org type could not be confirmed automatically, treat this environment carefully until you verify whether it is production or sandbox.';

    return `# Welcome to the Salesforce Workbench

${buildOrgIntro(orgContext)}

${environmentWarning}

## What this workspace is

This embedded workspace is a lightweight version of VS Code focused on Salesforce workflows inside the browser. It is meant to help you inspect metadata, edit files, run targeted commands, and collaborate with the built-in agent.

## What this workspace is good for

- Reviewing and editing project files directly in the browser
- Syncing Salesforce metadata into the Explorer
- Running focused Salesforce commands without leaving the workbench
- Using the built-in agent to inspect code, explain files, and help with targeted changes

## Important limitations to keep in mind

- Some desktop VS Code capabilities are intentionally limited or unavailable in this embedded experience.
- This workbench is designed for focused Salesforce tasks, not full parity with a local desktop IDE.
- Certain extensions, advanced desktop-only workflows, and local machine integrations may not be available here.
- Salesforce metadata actions are exposed through the **Salesforce** panel and command palette.

## Current org context

${orgNameLine}${hostLine}${usernameLine}${orgIdLine}- Environment: **${orgContext.environmentLabel}**

## How the built-in agent can help

- Explain files, flows, and Salesforce-specific code in this workspace
- Help you locate metadata, commands, and implementation entry points
- Make scoped code edits and suggest safer next steps
- Summarize what changed after an edit or help you understand a diff

## When to stay careful

- Double-check the org banner before editing or deploying
- Be extra cautious when the org is production or when the org type is unknown
- Prefer reviewing metadata changes before syncing or deploying them
- Treat this workbench as a lightweight environment and switch to a fuller local setup if you need desktop-only capabilities

## Suggested next steps

1. Review the org banner above the workbench before making changes.
2. Open the Salesforce panel and sync metadata into the Explorer.
3. Open the agent when you need help navigating, understanding, or changing this workspace.
4. Confirm the org type before making risky changes if the environment is still shown as unknown.
`;
}

type WalkthroughContributes = {
    walkthroughs: unknown[];
};

export async function register(
    vscodeBundle: WalkthroughVscodeBundle,
    _ctx: { coreServices?: unknown } = {}
) {
    const orgContext: OrgContextInput = getWorkbenchOrgContext() || {};
    const nextOrgContext = buildOrgContext(orgContext);

    const manifest = buildSalesforceExtensionConfig({
        name: WALKTHROUGH_EXTENSION_NAME,
        displayName: 'Salesforce Workbench Walkthrough',
        description: 'Welcome and onboarding support for the embedded Salesforce workbench',
        contributes: {
            commands: [
                {
                    command: 'workbench-walkthrough.open',
                    title: 'Salesforce Workbench: Open Welcome',
                },
            ],
            menus: {
                commandPalette: [{ command: 'workbench-walkthrough.open' }],
            },
            walkthroughs: [
                {
                    id: `${WALKTHROUGH_EXTENSION_ID}#open`,
                    title: 'Salesforce Workbench Welcome',
                    description:
                        'Review your connected org, understand the limits of this lightweight workbench, and use the built-in agent effectively.',
                    when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                    icon: { type: 'icon', icon: { id: 'book' } },
                    steps: [
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#step1`,
                            title: 'Review your org context',
                            description: buildOrgIntro(orgContext || {}),
                            media: {
                                markdown: 'workbench-onboarding.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: [],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#syncMetadata`,
                            title: 'Sync metadata from the Salesforce panel',
                            description:
                                'Open the **Salesforce** bottom panel and pull your org source into the workspace.\n[Open Salesforce Panel](command:salesforceMetadata.openSalesforcePanel)\n[Sync Project](command:salesforceMetadata.fetchMetadata)',
                            media: {
                                markdown: 'sync-metadata.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: ['onCommand:salesforceMetadata.fetchMetadata'],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#fetchLogs`,
                            title: 'Fetch and tail debug logs',
                            description:
                                'Open the **Salesforce Logs** panel from the activity bar. It lets you enable trace flags, browse recent `ApexLog` records, and tail new logs in one place.\n[Open Salesforce Logs Panel](command:salesforceMetadata.logs.openPanel)',
                            media: {
                                markdown: 'fetch-logs.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: ['onCommand:salesforceMetadata.logs.openPanel'],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#orgBrowser`,
                            title: 'Browse and retrieve metadata with the Org Browser',
                            description:
                                'The **Org Browser** panel lists every metadata type in the connected org and lets you retrieve components with a single click — no `package.xml` authoring required.\n[Open Org Browser](command:salesforceOrgBrowser.openView)',
                            media: {
                                markdown: 'org-browser.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: ['onCommand:salesforceOrgBrowser.openView'],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#runSoql`,
                            title: 'Query the org with SOQL',
                            description:
                                'Open a SOQL scratch file and run a query against the connected org.\n[Open SOQL Scratch](command:salesforceMetadata.openSoqlScratch)\n[Run SOQL Query](command:salesforceMetadata.runSoqlQuery)',
                            media: {
                                markdown: 'run-soql.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: [
                                'onCommand:salesforceMetadata.runSoqlQuery',
                                'onCommand:salesforceMetadata.runToolingQuery',
                            ],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#runApex`,
                            title: 'Run Anonymous Apex',
                            description:
                                'Execute ad-hoc Apex against the connected org — with or without a debug log.\n[Execute Anonymous](command:salesforceMetadata.executeAnonymous)\n[Execute Anonymous with Logs](command:salesforceMetadata.executeAnonymousWithLogs)',
                            media: {
                                markdown: 'run-anonymous-apex.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: [
                                'onCommand:salesforceMetadata.executeAnonymous',
                                'onCommand:salesforceMetadata.executeAnonymousWithLogs',
                            ],
                        },
                        {
                            id: `${WALKTHROUGH_EXTENSION_ID}#deployRetrieve`,
                            title: 'Deploy changes back to the org',
                            description:
                                'Push local changes to the org. Auto-deploy on save is toggled from the Salesforce panel — manual deploys and validations live in the Command Palette.\n[Deploy (Metadata API)](command:salesforceMetadata.deployMetadataApi)\n[Validate Deploy](command:salesforceMetadata.validateDeployMetadataApi)',
                            media: {
                                markdown: 'deploy-retrieve.md',
                            },
                            when: vscodeBundle.vscodeApiMonaco.ContextKeyExpr.true(),
                            completionEvents: [
                                'onCommand:salesforceMetadata.deployMetadataApi',
                                'onCommand:salesforceMetadata.validateDeployMetadataApi',
                            ],
                        },
                    ],
                },
            ],
        },
    });

    const WALKTHROUGH_EXTENSION_ASSETS = [
        {
            targetPath: '/workspace/vscode/walkthrough/workbench-onboarding.md',
            content:
                'data:text/markdown;base64,' +
                window.btoa(unescape(encodeURIComponent(buildWalkthroughMarkdown(nextOrgContext)))),
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/review-org-context.md',
            targetPath: '/workspace/vscode/walkthrough/review-org-context.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/open-salesforce-panel.md',
            targetPath: '/workspace/vscode/walkthrough/open-salesforce-panel.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/sync-metadata.md',
            targetPath: '/workspace/vscode/walkthrough/sync-metadata.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/run-soql.md',
            targetPath: '/workspace/vscode/walkthrough/run-soql.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/run-anonymous-apex.md',
            targetPath: '/workspace/vscode/walkthrough/run-anonymous-apex.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/fetch-logs.md',
            targetPath: '/workspace/vscode/walkthrough/fetch-logs.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/deploy-retrieve.md',
            targetPath: '/workspace/vscode/walkthrough/deploy-retrieve.md',
            mimeType: 'text/markdown',
        },
        {
            sourcePath: '/libs/extensions/walkthrough/org-browser.md',
            targetPath: '/workspace/vscode/walkthrough/org-browser.md',
            mimeType: 'text/markdown',
        },
    ];

    const contributes = manifest.contributes as WalkthroughContributes;
    const walkthroughEntry = contributes.walkthroughs[0];

    return registerSalesforceExtension(
        vscodeBundle,
        {
            config: manifest,
            remoteAssets: WALKTHROUGH_EXTENSION_ASSETS,
        },
        async (vscode, { push }) => {
            const vsc = vscode as {
                commands: {
                    registerCommand: (
                        id: string,
                        fn: () => Promise<void>
                    ) => { dispose?: () => void };
                    executeCommand: (cmd: string, ...args: unknown[]) => Promise<unknown>;
                };
                window?: { showInformationMessage?: (msg: string) => Promise<unknown> };
            };
            if (!vsc?.commands) return;

            const walkthroughsService = await vscodeBundle.vscodeApi.getService(
                vscodeBundle.vscodeApi.IWalkthroughsService
            );
            walkthroughsService.registerWalkthrough(walkthroughEntry);
            push(
                createCallbackDisposable(() =>
                    walkthroughsService.unregisterWalkthrough(walkthroughEntry)
                )
            );

            push(
                vsc.commands.registerCommand('workbench-walkthrough.open', async () => {
                    try {
                        await vsc.commands.executeCommand(
                            'workbench.action.openWalkthrough',
                            `${WALKTHROUGH_EXTENSION_ID}#open`
                        );
                    } catch {
                        await vsc.window?.showInformationMessage?.(
                            'Welcome walkthrough is not available in this workbench build.'
                        );
                    }
                })
            );

            try {
                void vsc.commands.executeCommand(
                    'workbench.action.openWalkthrough',
                    `${WALKTHROUGH_EXTENSION_ID}#open`
                );
            } catch {
                // ignore — walkthrough auto-open is best-effort
            }
        }
    );
}
