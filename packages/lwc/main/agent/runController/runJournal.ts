import { z } from 'zod';
import type { RunSnapshot } from './runController';

export const RUN_JOURNAL_PATH = '/workspace/agent-runs/pending.json';
const request = z.object({
    id: z.string(),
    prompt: z.string(),
    model: z.string(),
    fileNames: z.array(z.string()),
    isPush: z.boolean().optional(),
    reasoning: z.string().optional(),
    orgId: z.string().optional(),
    orgAlias: z.string().optional(),
    browserTabId: z.number().optional(),
    attachments: z
        .array(
            z.object({
                path: z
                    .string()
                    .startsWith('/workspace/agent-runs/files/')
                    .refine(path => !path.split('/').includes('..')),
                name: z.string(),
                type: z.string(),
            })
        )
        .optional(),
    recovered: z.boolean().optional(),
    interrupted: z.boolean().optional(),
});
const journal = z.object({
    version: z.literal(1),
    runs: z.array(z.object({ id: z.string(), requests: z.array(request) })),
});
export async function loadRunJournal(fs: {
    exists(path: string): Promise<boolean>;
    readFile(path: string): Promise<string>;
}): Promise<RunSnapshot[]> {
    if (!(await fs.exists(RUN_JOURNAL_PATH))) return [];
    return journal.parse(JSON.parse(await fs.readFile(RUN_JOURNAL_PATH))).runs.map(run => ({
        id: run.id,
        requests: run.requests.map(item => ({
            ...item,
            id: item.id,
            prompt: item.prompt,
            model: item.model,
            fileNames: item.fileNames,
            attachments: item.attachments?.map(file => ({
                path: file.path,
                name: file.name,
                type: file.type,
            })),
        })),
    }));
}
export async function saveRunJournal(
    fs: {
        writeFile(path: string, content: string): Promise<void>;
        exists?(path: string): Promise<boolean>;
        readFile?(path: string): Promise<string>;
        rm?(path: string): Promise<void>;
    },
    runs: RunSnapshot[],
    changedId?: string
) {
    const save = async () => {
        let merged = runs;
        let previous: RunSnapshot[] = [];
        if (changedId && fs.exists && fs.readFile) {
            previous = await loadRunJournal({
                exists: fs.exists.bind(fs),
                readFile: fs.readFile.bind(fs),
            });
            merged = [
                ...previous.filter(run => run.id !== changedId),
                ...runs.filter(run => run.id === changedId),
            ];
        }
        await fs.writeFile(
            RUN_JOURNAL_PATH,
            JSON.stringify(journal.parse({ version: 1, runs: merged }))
        );
        if (fs.rm) {
            const retained = new Set(
                merged.flatMap(run =>
                    run.requests.flatMap(request =>
                        (request.attachments || []).map(file => file.path)
                    )
                )
            );
            const removed = previous
                .flatMap(run => run.requests.flatMap(request => request.attachments || []))
                .filter(file => !retained.has(file.path));
            for (const file of removed) await fs.rm(file.path).catch(() => {});
        }
    };
    if (typeof navigator !== 'undefined' && navigator.locks)
        await navigator.locks.request('workbench.agent.journal', save);
    else await save();
}

export function assertRecoveryContext(
    request: { orgId?: string; orgAlias?: string; browserTabId?: number },
    current: { orgId?: string; orgAlias?: string; browserTabId?: number }
) {
    if (
        request.orgId
            ? request.orgId !== current.orgId
            : (request.orgAlias || '') !== (current.orgAlias || '')
    )
        throw new Error('Reconnect the original Salesforce org before resuming this task.');
    if (request.browserTabId !== undefined && request.browserTabId !== current.browserTabId)
        throw new Error('Select the original browser tab before resuming this task.');
}
