/**
 * Host command registry.
 *
 * Extensions register named commands at mount (e.g. `soql.executeQuery`).
 * Callers in other parts of the host — electron launch intents, the agent
 * tool runtime — invoke them by id without importing the extension. If
 * the extension isn't loaded (not installed, not mounted yet, or disabled),
 * `invokeCommand` logs a warning and resolves to `undefined` instead of
 * crashing. This is the primitive that lets us detach SOQL (and other
 * apps) from core without creating hard load-order or missing-module
 * failures.
 *
 * Command ids are namespaced by their owning app: `<appId>.<verb>`
 * (e.g. `soql.executeQuery`). Handlers receive a single payload argument
 * — keep payloads serialisable when possible so command invocations can
 * later be proxied over IPC / window-message boundaries without change.
 */

const commands = new Map();

/**
 * Register a command. Returns an unregister callback.
 *
 * Re-registering the same id replaces the previous handler — this is
 * deliberate so a hot-reloaded extension can re-bind its handlers without
 * forcing a full page refresh. In dev a warning is logged on replacement
 * to surface accidental collisions.
 */
export function registerCommand(id, handler) {
    if (!id || typeof id !== 'string') {
        throw new Error('registerCommand: id must be a non-empty string');
    }
    if (typeof handler !== 'function') {
        throw new Error(`registerCommand: handler for "${id}" must be a function`);
    }
    if (process.env.NODE_ENV !== 'production' && commands.has(id)) {
        // eslint-disable-next-line no-console
        console.warn(`[host-api/commands] "${id}" already registered; replacing.`);
    }
    commands.set(id, handler);
    return () => {
        // Only clear if we still own the slot — a later register for the
        // same id should not be undone by an earlier registration's cleanup.
        if (commands.get(id) === handler) {
            commands.delete(id);
        }
    };
}

export function hasCommand(id) {
    return commands.has(id);
}

/**
 * Invoke a command. Returns whatever the handler returns, or `undefined`
 * if no handler is registered. Callers that need to distinguish
 * "command missing" from "command returned undefined" should use
 * `hasCommand` first.
 *
 * Errors thrown by the handler propagate — the registry is not a
 * try/catch wrapper. If you need a "fire and forget" call, discard the
 * promise explicitly at the call site.
 */
export async function invokeCommand(id, payload) {
    const handler = commands.get(id);
    if (!handler) {
        if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
                `[host-api/commands] "${id}" is not registered — the extension that owns it may not be mounted.`
            );
        }
        return undefined;
    }
    return await handler(payload);
}

/**
 * Test-only: drop all registrations. Not exported from the public barrel.
 */
export function __resetCommandsForTests() {
    commands.clear();
}
