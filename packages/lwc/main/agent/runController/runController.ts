export interface QueuedRun {
    id: string;
    prompt: string;
    fileNames: string[];
    model: string;
    isPush?: boolean;
}

export interface ConversationRunState {
    id: string;
    running: boolean;
    paused: boolean;
    queue: QueuedRun[];
}

type RunEntry = { request: QueuedRun; execute: (signal: AbortSignal) => Promise<void> };
type ConversationRuns = {
    queue: RunEntry[];
    active: AbortController | null;
    finished?: Promise<void>;
    paused: boolean;
};

/** Owns execution independently of component mounts and the currently selected conversation. */
export class ConversationRunController {
    private conversations = new Map<string, ConversationRuns>();
    private retiring = new Map<string, Promise<void>>();
    private onChange: (state: ConversationRunState) => void;
    private onError: (id: string, error: unknown) => void;
    constructor(
        onChange: (state: ConversationRunState) => void,
        onError: (id: string, error: unknown) => void
    ) {
        this.onChange = onChange;
        this.onError = onError;
    }

    enqueue(id: string, request: QueuedRun, execute: RunEntry['execute']): void {
        const state = this.conversations.get(id) || { queue: [], active: null, paused: false };
        this.conversations.set(id, state);
        const entry = { request: { ...request, fileNames: [...request.fileNames] }, execute };
        if (request.isPush) state.queue.unshift(entry);
        else state.queue.push(entry);
        state.paused = false;
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

    resume(id: string): void {
        const state = this.conversations.get(id);
        if (!state) return;
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
    }

    private publish(id: string, state: ConversationRuns): void {
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
    }

    private async drain(id: string, state: ConversationRuns): Promise<void> {
        if (state.active || state.paused || this.conversations.get(id) !== state) return;
        const entry = state.queue.shift();
        if (!entry) return;
        const controller = new AbortController();
        state.active = controller;
        let finish!: () => void;
        state.finished = new Promise(resolve => {
            finish = resolve;
        });
        this.publish(id, state);
        try {
            // Clear can reuse a conversation id while the previous run is still releasing resources.
            const retiring = this.retiring.get(id);
            if (retiring) {
                await retiring;
                if (this.retiring.get(id) === retiring) this.retiring.delete(id);
            }
            controller.signal.throwIfAborted();
            await entry.execute(controller.signal);
        } catch (error) {
            if (!controller.signal.aborted && this.conversations.get(id) === state) {
                state.paused = true;
                this.onError(id, error);
            }
        } finally {
            state.active = null;
            state.finished = undefined;
            finish();
            this.publish(id, state);
            void this.drain(id, state);
        }
    }
}
