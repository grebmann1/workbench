import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getSupportedBuiltInToolTypes, filterToolsByModel } from '../modelToolSupport.ts';

test('getSupportedBuiltInToolTypes: exact family id lookup', () => {
    const set = getSupportedBuiltInToolTypes('gpt-5');
    assert.ok(set.has('web_search'));
    assert.ok(set.has('image_generation'));
});

test('getSupportedBuiltInToolTypes: date-suffixed model routes to family (startsWith family+"-")', () => {
    // gpt-5.4-2026-03-05 should fall back to gpt-5.4 family
    const set = getSupportedBuiltInToolTypes('gpt-5.4-2026-03-05');
    assert.ok(set.has('web_search'));
    assert.ok(set.has('shell'));
});

test('getSupportedBuiltInToolTypes: nano family has no image_generation', () => {
    const set = getSupportedBuiltInToolTypes('gpt-5-nano');
    assert.equal(set.has('image_generation'), false);
    assert.ok(set.has('web_search'));
});

test('getSupportedBuiltInToolTypes: unknown model falls back to gpt-5-mini list', () => {
    const set = getSupportedBuiltInToolTypes('made-up-model');
    // mini does NOT have image_generation
    assert.equal(set.has('image_generation'), false);
    assert.ok(set.has('web_search'));
});

test('getSupportedBuiltInToolTypes: empty/null model → falls back safely', () => {
    const set = getSupportedBuiltInToolTypes('');
    assert.ok(set.size > 0);
    const set2 = getSupportedBuiltInToolTypes(null as any);
    assert.ok(set2.size > 0);
});

test('filterToolsByModel: function tools always pass through', () => {
    const tools = [
        { type: 'function', name: 'my_fn' },
        { type: 'web_search' },
        { type: 'image_generation' },
    ];
    const filtered = filterToolsByModel(tools, 'gpt-5-nano');
    assert.ok(filtered.some(t => t.type === 'function'));
    assert.ok(filtered.some(t => t.type === 'web_search'));
    assert.equal(
        filtered.some(t => t.type === 'image_generation'),
        false
    );
});

test('filterToolsByModel: uses providerData.type when top-level type missing', () => {
    const tools: any[] = [
        { providerData: { type: 'web_search' } },
        { providerData: { type: 'image_generation' } },
    ];
    const filtered = filterToolsByModel(tools, 'gpt-5-nano');
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].providerData.type, 'web_search');
});

test('filterToolsByModel: empty input passes through', () => {
    assert.deepEqual(filterToolsByModel([], 'gpt-5'), []);
    assert.equal(filterToolsByModel(null as any, 'gpt-5'), null);
});

test('filterToolsByModel: tools with no type dropped', () => {
    const tools: any[] = [null, 'string', { foo: 1 }];
    const filtered = filterToolsByModel(tools, 'gpt-5');
    assert.equal(filtered.length, 0);
});
