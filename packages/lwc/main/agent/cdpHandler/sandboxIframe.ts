export const SANDBOX_READY_TIMEOUT_MS = 10_000;
export const SANDBOX_PING_TIMEOUT_MS = 2_000;
export const IFRAME_LOAD_TIMEOUT_MS = 10_000;
export const DEFAULT_EVAL_TIMEOUT_MS = 30_000;

type SandboxIframeLike = {
    contentWindow?: unknown;
    isConnected?: boolean;
} | null;

/**
 * True when the eval iframe is still attached and has a window we can postMessage to.
 * A stale CdpHandler (side panel remount, failed init left in the map) otherwise
 * swallows EVAL_REQUEST and the js command hangs until Execution timeout.
 */
export function isSandboxIframeAlive(iframe: SandboxIframeLike): boolean {
    if (!iframe) return false;
    if (!iframe.contentWindow) return false;
    if (typeof iframe.isConnected === 'boolean' && !iframe.isConnected) return false;
    return true;
}
