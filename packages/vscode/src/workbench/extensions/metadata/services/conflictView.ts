/*
 * Conflict view tree provider for sf-toolkit-web.
 *
 * Ported from salesforcedx-vscode-metadata's conflict/conflictTreeProvider.ts
 * and conflictTreeItem.ts. Wires the ConflictDetectionService snapshot into a
 * simple two-level tree: a root group with the count + one leaf per conflict.
 */

import { registerCommand } from '../../core/extensionRegistration';
import type { ConflictDetectionService, ConflictEntry } from './conflictDetectionService';

export const CONFLICT_VIEW_ID = 'salesforceMetadata.view.conflicts';
export const CONFLICT_VIEW_CONTAINER_ID = 'salesforceMetadataConflicts';

export const CONFLICT_OPEN_COMMAND = 'salesforceMetadata.conflict.open';
export const CONFLICT_DIFF_COMMAND = 'salesforceMetadata.conflict.diff';
export const CONFLICT_REFRESH_COMMAND = 'salesforceMetadata.conflict.refresh';
export const CONFLICT_FOCUS_COMMAND = 'salesforceMetadata.view.conflicts';

type ConflictTreeItemKind = 'group' | 'conflict' | 'empty';

type GroupInputs = { kind: 'group'; label: string; count: number };
type EmptyInputs = { kind: 'empty'; label: string };
type ConflictInputs = { kind: 'conflict'; entry: ConflictEntry };
type ConflictTreeItemInputs = GroupInputs | EmptyInputs | ConflictInputs;

function createConflictTreeItem(vscode, inputs: ConflictTreeItemInputs) {
    const label =
        inputs.kind === 'conflict'
            ? `${inputs.entry.type}: ${inputs.entry.fullName || inputs.entry.path}`
            : inputs.label;
    const collapsibleState =
        inputs.kind === 'group'
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.None;

    const item: any = new vscode.TreeItem(label, collapsibleState);
    item.kind = inputs.kind;

    if (inputs.kind === 'group') {
        item.description = `${inputs.count} conflict${inputs.count === 1 ? '' : 's'}`;
        item.iconPath = new vscode.ThemeIcon('warning');
        item.contextValue = 'conflictGroup';
    } else if (inputs.kind === 'empty') {
        item.description = '';
        item.iconPath = new vscode.ThemeIcon('check');
        item.contextValue = 'conflictEmpty';
    } else if (inputs.kind === 'conflict') {
        item.description = inputs.entry.path;
        item.tooltip = [
            `Path: ${inputs.entry.path}`,
            `Type: ${inputs.entry.type}`,
            inputs.entry.fullName ? `Name: ${inputs.entry.fullName}` : '',
            inputs.entry.remoteStamp ? `Remote: ${inputs.entry.remoteStamp}` : '',
        ]
            .filter(Boolean)
            .join('\n');
        item.iconPath = new vscode.ThemeIcon('diff-modified');
        item.contextValue = 'conflictEntry';
        item.resourceUri = vscode.Uri.file(inputs.entry.path);
        item.entry = inputs.entry;
        item.command = {
            title: 'Open Conflicting File',
            command: CONFLICT_OPEN_COMMAND,
            arguments: [inputs.entry],
        };
    }

    return item;
}

export function createConflictTreeProvider({
    vscode,
    conflictService,
}: {
    vscode: any;
    conflictService: ConflictDetectionService;
}) {
    const onDidChangeTreeDataEmitter = new vscode.EventEmitter();

    const provider: any = {
        onDidChangeTreeData: onDidChangeTreeDataEmitter.event,
        getTreeItem(element: any) {
            return element;
        },
        async getChildren(element: any) {
            const snapshot = conflictService.getLastSnapshot();
            const entries = snapshot.entries || [];

            if (!element) {
                const label = entries.length
                    ? 'Conflicts detected'
                    : snapshot.note || 'No conflicts';
                return [
                    createConflictTreeItem(vscode, {
                        kind: 'group',
                        label,
                        count: entries.length,
                    }),
                ];
            }

            if (element.kind === 'group') {
                if (entries.length === 0) {
                    return [
                        createConflictTreeItem(vscode, {
                            kind: 'empty',
                            label: snapshot.note || 'No conflicts detected.',
                        }),
                    ];
                }
                return entries.map(entry =>
                    createConflictTreeItem(vscode, { kind: 'conflict', entry })
                );
            }

            return [];
        },
        refresh() {
            onDidChangeTreeDataEmitter.fire();
        },
        dispose() {
            onDidChangeTreeDataEmitter.dispose();
        },
    };

    const subscription = conflictService.onDidChangeConflicts(() => provider.refresh());
    const originalDispose = provider.dispose;
    provider.dispose = () => {
        subscription.dispose();
        originalDispose();
    };

    return provider;
}

export function registerConflictView({
    context,
    vscode,
    conflictService,
}: {
    context: { addDisposable: (d: unknown) => unknown };
    vscode: any;
    conflictService: ConflictDetectionService;
}) {
    const provider = createConflictTreeProvider({ vscode, conflictService });
    context.addDisposable(provider);

    if (typeof vscode.window?.createTreeView === 'function') {
        const treeView = vscode.window.createTreeView(CONFLICT_VIEW_ID, {
            treeDataProvider: provider,
        });
        context.addDisposable(treeView);
    } else if (typeof vscode.window?.registerTreeDataProvider === 'function') {
        context.addDisposable(vscode.window.registerTreeDataProvider(CONFLICT_VIEW_ID, provider));
    }

    registerCommand(context, vscode, CONFLICT_REFRESH_COMMAND, async () => {
        await conflictService.detect({ force: true });
    });

    registerCommand(context, vscode, CONFLICT_OPEN_COMMAND, async (entry: unknown) => {
        const conflict = entry as ConflictEntry | undefined;
        if (!conflict?.path) {
            return;
        }
        try {
            const uri = vscode.Uri.file(conflict.path);
            await vscode.window.showTextDocument(uri, { preview: true });
        } catch {
            // ignore open failures
        }
    });

    registerCommand(context, vscode, CONFLICT_DIFF_COMMAND, async (entry: unknown) => {
        const conflict = entry as ConflictEntry | undefined;
        if (!conflict?.path) {
            return;
        }
        try {
            const uri = vscode.Uri.file(conflict.path);
            await vscode.commands.executeCommand('vscode.open', uri);
        } catch (error) {
            await vscode.window?.showErrorMessage?.(
                `Could not open conflict diff: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    });

    registerCommand(context, vscode, CONFLICT_FOCUS_COMMAND, async () => {
        const attempts = [
            `workbench.view.extension.${CONFLICT_VIEW_CONTAINER_ID}`,
            `workbench.actions.treeView.${CONFLICT_VIEW_ID}.focus`,
        ];
        for (const command of attempts) {
            try {
                // eslint-disable-next-line no-await-in-loop
                await vscode.commands.executeCommand(command);
            } catch {
                // try next fallback
            }
        }
        await conflictService.detect({ force: true }).catch(() => null);
    });

    return provider;
}
