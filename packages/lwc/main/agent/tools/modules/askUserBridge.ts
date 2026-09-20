// Bridge between ask_user tool's execute() and the LWC UI.
// The tool stores a deferred promise here; the UI resolves it when the user answers.

type DeferredResolver = {
    resolve: (answer: string) => void;
    reject: (reason?: unknown) => void;
    cleanup: () => void;
};

const _pending = new Map<string, DeferredResolver>();

export function createQuestion(id: string, signal?: AbortSignal): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        if (signal?.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => {
            rejectQuestion(id);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('agent:question_closed', { detail: { id } }));
            }
        };
        _pending.set(id, {
            resolve,
            reject,
            cleanup: () => signal?.removeEventListener('abort', onAbort),
        });
        signal?.addEventListener('abort', onAbort, { once: true });
    });
}

export function resolveQuestion(id: string, answer: string): void {
    const deferred = _pending.get(id);
    if (deferred) {
        _pending.delete(id);
        deferred.cleanup();
        deferred.resolve(answer);
    }
}

export function rejectQuestion(id: string): void {
    const deferred = _pending.get(id);
    if (deferred) {
        _pending.delete(id);
        deferred.cleanup();
        deferred.reject(new Error('Question dismissed'));
    }
}
