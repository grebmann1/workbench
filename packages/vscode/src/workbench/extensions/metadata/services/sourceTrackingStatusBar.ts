/*
 * Source tracking status bar for sf-toolkit-web.
 *
 * Ported from salesforcedx-vscode-metadata's statusBar/sourceTrackingStatusBar.ts.
 * Shows "N$(warning) N$(arrow-down) N$(arrow-up)" for conflict/remote/local
 * counts, using ConflictDetectionService snapshots driven by a plain
 * setInterval poll plus onDidSaveTextDocument refreshes.
 */

import { hasUsableConnection } from '../../../connection/connectionFactory';
import { CONFLICT_FOCUS_COMMAND } from './conflictView';
import type { ConflictDetectionService } from './conflictDetectionService';

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 15_000;
const PRIORITY = 80;

type StatusBarCounts = {
    conflicts: number;
    remote: number;
    local: number;
};

function formatText({ conflicts, remote, local }: StatusBarCounts) {
    return `${conflicts}$(warning) ${remote}$(arrow-down) ${local}$(arrow-up)`;
}

function getCommand({ conflicts, remote, local }: StatusBarCounts): string | undefined {
    if (conflicts > 0) {
        return CONFLICT_FOCUS_COMMAND;
    }
    if (remote > 0 && local === 0) {
        return 'salesforceMetadata.pullRemoteChanges';
    }
    if (local > 0 && remote === 0) {
        return 'salesforceMetadata.deployChangedFiles';
    }
    if (remote > 0 && local > 0) {
        return 'salesforceMetadata.deployChangedFiles';
    }
    return 'salesforceMetadata.sourceStatus';
}

function buildTooltip(vscode: any, counts: StatusBarCounts, note?: string | null) {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.appendMarkdown(`**Salesforce Source Tracking**\n\n`);
    md.appendMarkdown(`- Conflicts: **${counts.conflicts}**\n`);
    md.appendMarkdown(`- Remote changes: **${counts.remote}**\n`);
    md.appendMarkdown(`- Local changes: **${counts.local}**\n\n`);
    if (note) {
        md.appendMarkdown(`_${note}_\n\n`);
    }
    if (counts.conflicts > 0) {
        md.appendMarkdown(`Click to view conflicts.`);
    } else if (counts.remote > 0 && counts.local === 0) {
        md.appendMarkdown(`Click to pull remote changes.`);
    } else if (counts.local > 0 && counts.remote === 0) {
        md.appendMarkdown(`Click to deploy changed files.`);
    } else if (counts.remote > 0 && counts.local > 0) {
        md.appendMarkdown(`Click to deploy changed files, then pull remote.`);
    } else {
        md.appendMarkdown(`Click to run Source Status.`);
    }
    return md;
}

export function registerSourceTrackingStatusBar({
    context,
    vscode,
    connectionRuntime,
    conflictService,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
    context: { addDisposable: (d: unknown) => unknown };
    vscode: any;
    connectionRuntime: any;
    conflictService: ConflictDetectionService;
    pollIntervalMs?: number;
}) {
    const safeInterval = Math.max(MIN_POLL_INTERVAL_MS, Number(pollIntervalMs) || DEFAULT_POLL_INTERVAL_MS);

    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, PRIORITY);
    statusBar.name = 'Salesforce Source Tracking';
    statusBar.text = formatText({ conflicts: 0, remote: 0, local: 0 });
    statusBar.tooltip = buildTooltip(vscode, { conflicts: 0, remote: 0, local: 0 }, 'Waiting for connection…');
    context.addDisposable(statusBar);

    function applyCounts(counts: StatusBarCounts, note: string | null | undefined) {
        statusBar.text = formatText(counts);
        statusBar.tooltip = buildTooltip(vscode, counts, note);
        statusBar.command = getCommand(counts);
        if (counts.conflicts > 0) {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else if (counts.local > 0 || counts.remote > 0) {
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        } else {
            statusBar.backgroundColor = undefined;
        }
    }

    function hideOrShow() {
        const conn = connectionRuntime.loadStoredConn();
        if (!hasUsableConnection(conn)) {
            statusBar.hide();
            return false;
        }
        statusBar.show();
        return true;
    }

    async function refresh() {
        if (!hideOrShow()) {
            return;
        }
        const snapshot = await conflictService.detect({ force: true }).catch(() => null);
        if (!snapshot) {
            return;
        }
        applyCounts(
            {
                conflicts: snapshot.entries.length,
                remote: snapshot.remoteChangedPaths.length,
                local: snapshot.localChangedPaths.length,
            },
            snapshot.note
        );
    }

    const conflictSubscription = conflictService.onDidChangeConflicts(snapshot => {
        if (!hideOrShow()) {
            return;
        }
        applyCounts(
            {
                conflicts: snapshot.entries.length,
                remote: snapshot.remoteChangedPaths.length,
                local: snapshot.localChangedPaths.length,
            },
            snapshot.note
        );
    });
    context.addDisposable(conflictSubscription);

    const removeStatusListener = connectionRuntime.addStatusChangeListener(() => {
        void refresh();
    });
    context.addDisposable({ dispose: removeStatusListener });

    const saveSubscription = vscode.workspace?.onDidSaveTextDocument?.(() => {
        void refresh();
    });
    if (saveSubscription) {
        context.addDisposable(saveSubscription);
    }

    const timerId = setInterval(() => {
        void refresh();
    }, safeInterval);
    context.addDisposable({
        dispose() {
            clearInterval(timerId);
        },
    });

    void refresh();

    return {
        refresh,
        dispose() {
            clearInterval(timerId);
        },
    };
}
