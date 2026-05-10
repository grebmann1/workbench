/**
 * Custom Node.js loader hooks for agentforceTools tests.
 * Intercepts `core/store`, `shared/logger`, and `core/connector` with mock implementations.
 */

const MOCK_MODULES = new Set(['core/store', 'shared/logger', 'core/connector']);

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
    if (url === 'mock:core/store') {
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

    if (url === 'mock:core/connector') {
        return {
            format: 'module',
            shortCircuit: true,
            source: `
export {};
`,
        };
    }

    return nextLoad(url, context);
}
