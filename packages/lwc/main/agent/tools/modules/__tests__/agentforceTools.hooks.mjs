/**
 * Custom Node.js loader hooks for agentforceTools tests.
 * Intercepts `core/store`, `host-api/store`, `shared/logger`, `core/connector`,
 * and `host-api/connector` with mock implementations so the test can import
 * the source module without dragging in the full LWC runtime.
 *
 * Activated programmatically from the test file via `module.register()` — not
 * from the global `tools/testing/register.mjs`, so other tests are unaffected.
 */

const MOCK_MODULES = new Set([
    'core/store',
    'host-api/store',
    'shared/logger',
    'core/connector',
    'host-api/connector',
    'host-api/commands',
]);

export async function resolve(specifier, context, nextResolve) {
    if (MOCK_MODULES.has(specifier)) {
        return {
            url: `mock:${specifier}`,
            shortCircuit: true,
        };
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url === 'mock:core/store' || url === 'mock:host-api/store') {
        return {
            format: 'module',
            shortCircuit: true,
            source: `
let _state = { application: { connector: null } };
export const store = {
    getState() { return _state; },
    dispatch() {},
    subscribe() { return () => {}; },
};
export function __setMockState(state) { _state = state; }
export function injectReducer() {}
export function removeReducer() {}
export function connectStore() {}
export function reportError() {}
`,
        };
    }

    if (url === 'mock:shared/logger') {
        return {
            format: 'module',
            shortCircuit: true,
            source: `
const LOGGER = { log() {}, warn() {}, error() {}, info() {}, debug() {} };
export default LOGGER;
`,
        };
    }

    if (url === 'mock:core/connector' || url === 'mock:host-api/connector') {
        return {
            format: 'module',
            shortCircuit: true,
            source: `
export {};
`,
        };
    }

    if (url === 'mock:host-api/commands') {
        return {
            format: 'module',
            shortCircuit: true,
            source: `
const _registered = new Set();
const _calls = [];
export function hasCommand(id) { return _registered.has(id); }
export async function invokeCommand(id, payload) {
    _calls.push({ id, payload });
    return undefined;
}
export function __setRegisteredCommands(ids) {
    _registered.clear();
    for (const id of ids) _registered.add(id);
}
export function __getInvokeCalls() { return _calls.slice(); }
export function __resetInvokeCalls() { _calls.length = 0; }
`,
        };
    }

    return nextLoad(url, context);
}
