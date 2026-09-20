export interface QueuedRun {
    id: string;
    prompt: string;
    fileNames: string[];
    model: string;
    isPush?: boolean;
    reasoning?: string;
    orgId?: string;
    orgAlias?: string;
    browserTabId?: number;
    attachments?: Array<{ path: string; name: string; type: string }>;
    recovered?: boolean;
    interrupted?: boolean;
}

export interface ConversationRunState {
    id: string;
    running: boolean;
    paused: boolean;
    queue: QueuedRun[];
}

export type RunSnapshot = { id: string; requests: QueuedRun[] };

type RunEntry = { request: QueuedRun; execute: (signal: AbortSignal) => Promise<void> };
type ConversationRuns = {
    queue: RunEntry[];
    active: AbortController | null;
    activeRequest?: QueuedRun;
    finished?: Promise<void>;
    paused: boolean;
};

/** Owns execution independently of component mounts and the currently selected conversation. */
export class ConversationRunController {
    private conversations = new Map<string, ConversationRuns>();
    private retiring = new Map<string, Promise<void>>();
    private onChange: (state: ConversationRunState) => void;
    private onError: (id: string, error: unknown) => void;
    private checkpoint: Promise<void> = Promise.resolve();
    private persist?: (snapshots: RunSnapshot[], changedId: string) => Promise<void>;
    private onComplete?: (id: string, request: QueuedRun) => void;
    constructor(
        onChange: (state: ConversationRunState) => void,
        onError: (id: string, error: unknown) => void,
        options: {
            persist?: (snapshots: RunSnapshot[], changedId: string) => Promise<void>;
            onComplete?: (id: string, request: QueuedRun) => void;
        } = {}
    ) {
        this.onChange = onChange;
        this.onError = onError;
        this.persist = options.persist;
        this.onComplete = options.onComplete;
    }

    restore(
        snapshots: RunSnapshot[],
        execute: (id: string, request: QueuedRun, signal: AbortSignal) => Promise<void>
    ): void {
        for (const snapshot of snapshots) {
            if (this.conversations.has(snapshot.id)) continue;
            const queue = snapshot.requests.map(request => ({
                request: { ...request, recovered: true },
                execute: (signal: AbortSignal) =>
                    execute(snapshot.id, { ...request, recovered: true }, signal),
            }));
            if (!queue.length) continue;
            const state: ConversationRuns = { queue, active: null, paused: true };
            this.conversations.set(snapshot.id, state);
            this.publish(snapshot.id, state, false);
        }
    }

    snapshots(): RunSnapshot[] {
        return Array.from(this.conversations, ([id, state]) => ({
            id,
            requests: [
                ...(state.activeRequest ? [{ ...state.activeRequest, interrupted: true }] : []),
                ...state.queue.map(entry => ({ ...entry.request })),
            ],
        })).filter(snapshot => snapshot.requests.length);
    }

    private save(id: string): void {
        if (!this.persist) return;
        const snapshot = this.snapshots();
        this.checkpoint = this.checkpoint.catch(() => {}).then(() => this.persist!(snapshot, id));
        void this.checkpoint.catch(error => this.onError(id, error));
    }

    enqueue(id: string, request: QueuedRun, execute: RunEntry['execute']): void {
        const state = this.conversations.get(id) || { queue: [], active: null, paused: false };
        this.conversations.set(id, state);
        const entry = { request: { ...request, fileNames: [...request.fileNames] }, execute };
        if (request.isPush) state.queue.unshift(entry);
        else state.queue.push(entry);
        // A newly sent message must not silently resume recovered work.
        if (!state.queue.some(item => item.request.recovered)) state.paused = false;
        this.publish(id, state);
        void this.drain(id, state);
    }

    stop(id: string): void {
        const state = this.conversations.get(id);
        if (!state) return;
        state.paused = true;
        state.active?.abort();
        this.publish(id, state);
    }

    resume(id: string, execute?: (request: QueuedRun, signal: AbortSignal) => Promise<void>): void {
        const state = this.conversations.get(id);
        if (!state) return;
        if (execute)
            for (const entry of state.queue) {
                if (entry.request.recovered)
                    entry.execute = signal => execute(entry.request, signal);
            }
        state.paused = false;
        void this.drain(id, state);
        this.publish(id, state);
    }

    remove(id: string, requestId: string): void {
        const state = this.conversations.get(id);
        if (!state) return;
        state.queue = state.queue.filter(entry => entry.request.id !== requestId);
        this.publish(id, state);
    }

    promote(id: string, requestId: string): void {
        const state = this.conversations.get(id);
        const entry = state?.queue.find(item => item.request.id === requestId);
        if (!state || !entry) return;
        entry.request = { ...entry.request, isPush: true };
        state.queue = [entry, ...state.queue.filter(item => item !== entry)];
        this.publish(id, state);
    }

    delete(id: string): void {
        const state = this.conversations.get(id);
        this.conversations.delete(id);
        if (state?.finished) {
            const finished = state.finished;
            this.retiring.set(id, finished);
            void finished.then(() => {
                if (this.retiring.get(id) === finished) this.retiring.delete(id);
            });
        }
        state?.active?.abort();
        this.onChange({ id, running: false, paused: false, queue: [] });
        this.save(id);
    }

    private publish(id: string, state: ConversationRuns, persist = true): void {
        if (this.conversations.get(id) !== state) return;
        this.onChange({
            id,
            running: !!state.active,
            paused: state.paused,
            queue: state.queue.map(entry => ({
                ...entry.request,
                fileNames: [...entry.request.fileNames],
            })),
        });
        if (persist) this.save(id);
    }

    private async drain(id: string, state: ConversationRuns): Promise<void> {
        if (state.active || state.paused || this.conversations.get(id) !== state) return;
        const entry = state.queue.shift();
        if (!entry) return;
        const controller = new AbortController();
        state.active = controller;
        state.activeRequest = entry.request;
        let finish!: () => void;
        state.finished = new Promise(resolve => {
            finish = resolve;
        });
        this.publish(id, state);
        try {
            try {
                if (this.persist) await this.checkpoint;
            } catch (error) {
                state.queue.unshift(entry);
                throw error;
            }
            // Clear can reuse a conversation id while the previous run is still releasing resources.
            const retiring = this.retiring.get(id);
            if (retiring) {
                await retiring;
                if (this.retiring.get(id) === retiring) this.retiring.delete(id);
            }
            controller.signal.throwIfAborted();
            await entry.execute(controller.signal);
            if (!controller.signal.aborted) {
                try {
                    this.onComplete?.(id, entry.request);
                } catch {
                    // A dismissed/unmounted notification must not turn completed work into a retry.
                }
            }
        } catch (error) {
            if (!controller.signal.aborted && this.conversations.get(id) === state) {
                state.paused = true;
                if (entry.request.recovered && !state.queue.includes(entry))
                    state.queue.unshift(entry);
                this.onError(id, error);
            }
        } finally {
            state.active = null;
            state.activeRequest = undefined;
            state.finished = undefined;
            finish();
            this.publish(id, state);
            void this.drain(id, state);
        }
    }
}
