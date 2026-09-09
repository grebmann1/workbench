export const WAIT_FOR_LOADED_TIMEOUT_MS = 30_000;
export const WAIT_FOR_LOADED_INTERVAL_MS = 1_000;

export function waitUntilNotLoading(
    isLoading: () => boolean,
    timeoutMs = WAIT_FOR_LOADED_TIMEOUT_MS
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (!isLoading()) {
            resolve();
            return;
        }
        const intervalId = setInterval(() => {
            if (!isLoading()) {
                clearInterval(intervalId);
                clearTimeout(timer);
                resolve();
            }
        }, WAIT_FOR_LOADED_INTERVAL_MS);
        const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
            clearInterval(intervalId);
            reject(new Error(`Timed out waiting for application to load after ${timeoutMs}ms`));
        }, timeoutMs);
    });
}
