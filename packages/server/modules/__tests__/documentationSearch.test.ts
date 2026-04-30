import assert from 'node:assert/strict';
import { test } from 'node:test';

/**
 * documentationSearch wraps a flexsearch Document index. flexsearch's
 * `worker: true` mode spawns a Web Worker that isn't available under
 * `node --test` — so we cover the one branch that doesn't need the index:
 * `searchDocumentation` must return [] when the index is uninitialised.
 *
 * The sorting / enrichment logic is exercised end-to-end by the dev server
 * integration tests; testing it here would require bringing up a worker
 * runtime that the unit suite doesn't have.
 */
test('searchDocumentation: returns [] when index is uninitialised', async () => {
    const { searchDocumentation } = await import('../documentationSearch.ts');
    // Fresh module = no init call yet.
    const result = await searchDocumentation({ keywords: 'anything' });
    assert.deepEqual(result, []);
});

test('searchDocumentation: returns [] without keywords when uninitialised', async () => {
    const { searchDocumentation } = await import('../documentationSearch.ts');
    const result = await searchDocumentation({});
    assert.deepEqual(result, []);
});

test('searchDocumentation: returns [] with filters but no init', async () => {
    const { searchDocumentation } = await import('../documentationSearch.ts');
    const result = await searchDocumentation({ filters: ['x', 'y'] });
    assert.deepEqual(result, []);
});
