import { register } from 'node:module';

// Register tsPathsResolver first (inner), then our mocks (outer, called first).
// In Node's hook chain, the last-registered hook is called first.
register('../../../../../../../tools/testing/tsPathsResolver.mjs', import.meta.url);
register('./agentforceTools.hooks.mjs', import.meta.url);
