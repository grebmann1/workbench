/*
 * Conflict detection service for sf-toolkit-web.
 *
 * Ported from salesforcedx-vscode-metadata's conflict/conflictDetection.ts.
 * Uses the existing deployTools.computeRemoteChangeStatus() (bridge-based
 * Tooling SOQL) and enriches the returned conflict paths with tooling-map
 * metadata so downstream consumers (tree view, status bar, pre-deploy gate)
 * can render meaningful entries.
 */

export type ConflictEntry = {
    path: string;
    type: string;
    fullName: string;
    id?: string;
    namespace?: string;
    remoteStamp: string | null;
};

export type ConflictDetectionSnapshot = {
    entries: ConflictEntry[];
    localChangedPaths: string[];
    remoteChangedPaths: string[];
    note: string | null;
    detectedAt: number;
};

type DeployToolsLike = {
    computeRemoteChangeStatus?: () => Promise<{
        conflictPaths: string[];
        localChangedPaths: string[];
        remoteChangedPaths: string[];
        note?: string | null;
    }>;
    loadToolingMapItems?: (options?: {
        force?: boolean;
    }) => Promise<Record<string, { type?: string; id?: string; namespace?: string; readOnly?: boolean }>>;
};

type ConflictListener = (snapshot: ConflictDetectionSnapshot) => void;

const EMPTY_SNAPSHOT: ConflictDetectionSnapshot = {
    entries: [],
    localChangedPaths: [],
    remoteChangedPaths: [],
    note: null,
    detectedAt: 0,
};

function deriveFullNameFromPath(path: string): string {
    const cleaned = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
    if (!cleaned) {
        return '';
    }
    const parts = cleaned.split('/').filter(Boolean);
    const fileName = parts[parts.length - 1] || cleaned;
    const firstDot = fileName.indexOf('.');
    return firstDot > 0 ? fileName.slice(0, firstDot) : fileName;
}

export function createConflictDetectionService({
    deployTools,
}: {
    deployTools: DeployToolsLike;
}) {
    let lastSnapshot: ConflictDetectionSnapshot = { ...EMPTY_SNAPSHOT };
    let inFlight: Promise<ConflictDetectionSnapshot> | null = null;
    const listeners = new Set<ConflictListener>();

    function emit(snapshot: ConflictDetectionSnapshot) {
        for (const listener of listeners) {
            try {
                listener(snapshot);
            } catch {
                // ignore listener errors
            }
        }
    }

    async function buildEntries(conflictPaths: string[]): Promise<ConflictEntry[]> {
        if (!conflictPaths?.length) {
            return [];
        }
        const mapItems =
            (typeof deployTools?.loadToolingMapItems === 'function'
                ? await deployTools.loadToolingMapItems().catch(() => null)
                : null) || {};
        return conflictPaths.map(path => {
            const entry = mapItems?.[path];
            const type = entry?.type || 'Unknown';
            const fullName = deriveFullNameFromPath(path);
            return {
                path,
                type,
                fullName,
                id: entry?.id,
                namespace: entry?.namespace,
                remoteStamp: null,
            };
        });
    }

    async function doDetect(): Promise<ConflictDetectionSnapshot> {
        if (typeof deployTools?.computeRemoteChangeStatus !== 'function') {
            const snapshot: ConflictDetectionSnapshot = {
                ...EMPTY_SNAPSHOT,
                note: 'Source tracking is not available.',
                detectedAt: Date.now(),
            };
            return snapshot;
        }

        try {
            const status = await deployTools.computeRemoteChangeStatus();
            const conflictPaths = Array.isArray(status?.conflictPaths) ? status.conflictPaths : [];
            const entries = await buildEntries(conflictPaths);
            return {
                entries,
                localChangedPaths: Array.isArray(status?.localChangedPaths)
                    ? [...status.localChangedPaths]
                    : [],
                remoteChangedPaths: Array.isArray(status?.remoteChangedPaths)
                    ? [...status.remoteChangedPaths]
                    : [],
                note: status?.note ?? null,
                detectedAt: Date.now(),
            };
        } catch (error) {
            return {
                ...EMPTY_SNAPSHOT,
                note: error instanceof Error ? error.message : 'Conflict detection failed.',
                detectedAt: Date.now(),
            };
        }
    }

    async function detect({
        force = false,
    }: { force?: boolean } = {}): Promise<ConflictDetectionSnapshot> {
        if (inFlight && !force) {
            return inFlight;
        }
        inFlight = doDetect()
            .then(snapshot => {
                lastSnapshot = snapshot;
                emit(snapshot);
                return snapshot;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    }

    function getLastSnapshot(): ConflictDetectionSnapshot {
        return lastSnapshot;
    }

    function reset() {
        lastSnapshot = { ...EMPTY_SNAPSHOT };
        emit(lastSnapshot);
    }

    function onDidChangeConflicts(listener: ConflictListener): { dispose(): void } {
        listeners.add(listener);
        return {
            dispose() {
                listeners.delete(listener);
            },
        };
    }

    return {
        detect,
        getLastSnapshot,
        onDidChangeConflicts,
        reset,
    };
}

export type ConflictDetectionService = ReturnType<typeof createConflictDetectionService>;
