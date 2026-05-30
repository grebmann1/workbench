/**
 * Host command registry runtime.
 *
 * The TypeScript sibling (`commands.ts`) owns the compile-time command
 * payload contract. This file stays JavaScript-only because the LWC Rollup
 * plugin resolves named modules itself and cannot parse TypeScript syntax in
 * those runtime module targets.
 */

const commands = new Map();

/**
 * Register a command. Returns an unregister callback.
 *
 * Re-registering the same id replaces the previous handler so hot reload can
 * re-bind commands without a full page refresh.
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
        // Only clear if we still own the slot; a later registration for the
        // same id should not be undone by an earlier cleanup callback.
        if (commands.get(id) === handler) {
            commands.delete(id);
        }
    };
}

export function hasCommand(id) {
    return commands.has(id);
}

/**
 * Invoke a command. Returns whatever the handler returns, or `undefined` if
 * no handler is registered.
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
