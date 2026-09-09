/**
 * Serializes async tasks so only one runs at a time.
 * The sandbox eval iframe is single-flight: overlapping EVAL_REQUESTs drop results.
 */
export function createSerializedTaskQueue() {
    let tail: Promise<void> = Promise.resolve();
    let generation = 0;
    let destroyed = false;

    function enqueue<T>(task: () => Promise<T>): Promise<T> {
        const startedGeneration = generation;
        const run = async (): Promise<T> => {
            if (destroyed) {
                throw new Error('CdpHandler destroyed');
            }
            if (startedGeneration !== generation) {
                throw new DOMException('Execution aborted by user', 'AbortError');
            }
            return task();
        };
        const result = tail.then(run, run);
        tail = result.then(
            () => undefined,
            () => undefined
        );
        return result;
    }

    function abortQueued(): void {
        generation += 1;
    }

    function destroy(): void {
        destroyed = true;
        generation += 1;
    }

    return { enqueue, abortQueued, destroy };
}
