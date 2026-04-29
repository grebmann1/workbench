import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getSupportedBuiltInToolTypes, filterToolsByModel } from '../modules/modelToolSupport.ts';

test('getSupportedBuiltInToolTypes: known family returns the exact set', () => {
    const set = getSupportedBuiltInToolTypes('gpt-5-mini');
    assert.ok(set.has('web_search'));
    assert.ok(set.has('mcp'));
    assert.ok(!set.has('shell'));
});

test('getSupportedBuiltInToolTypes: gpt-5.4 includes shell + apply_patch', () => {
    const set = getSupportedBuiltInToolTypes('gpt-5.4');
    assert.ok(set.has('shell'));
    assert.ok(set.has('apply_patch'));
    assert.ok(set.has('skills'));
});

test('getSupportedBuiltInToolTypes: dashed variant falls back to family prefix', () => {
    // 'gpt-5-2026-03-05' → family 'gpt-5'
    const set = getSupportedBuiltInToolTypes('gpt-5-2026-03-05');
    assert.ok(set.has('image_generation'));
    assert.ok(!set.has('shell'));
});

test('getSupportedBuiltInToolTypes: unknown model defaults to gpt-5-mini set', () => {
    const unknown = getSupportedBuiltInToolTypes('claude-something');
    const baseline = getSupportedBuiltInToolTypes('gpt-5-mini');
    assert.deepEqual([...unknown].sort(), [...baseline].sort());
});

test('getSupportedBuiltInToolTypes: empty / non-string input still returns a set (default family)', () => {
    assert.ok(getSupportedBuiltInToolTypes('') instanceof Set);
    assert.ok(getSupportedBuiltInToolTypes(null as unknown as string) instanceof Set);
});

test('filterToolsByModel: function tools are always kept regardless of model', () => {
    const tools = [
        { type: 'function', name: 'my_fn' },
        { type: 'function', name: 'another' },
    ];
    const out = filterToolsByModel(tools, 'gpt-5-mini');
    assert.equal(out.length, 2);
});

test('filterToolsByModel: built-in tools are filtered by the model allow-list', () => {
    const tools = [
        { type: 'web_search' },
        { type: 'shell' }, // not in gpt-5-mini
        { type: 'function', name: 'fn' },
    ];
    const out = filterToolsByModel(tools, 'gpt-5-mini');
    const types = out.map(t => t.type);
    assert.ok(types.includes('web_search'));
    assert.ok(types.includes('function'));
    assert.ok(!types.includes('shell'));
});

test('filterToolsByModel: reads tool.providerData.type when tool.type is absent', () => {
    const tools = [{ providerData: { type: 'web_search' } }];
    const out = filterToolsByModel(tools, 'gpt-5-mini');
    assert.equal(out.length, 1);
});

test('filterToolsByModel: drops tools with no resolvable type', () => {
    const tools = [{ random: 'junk' }];
    const out = filterToolsByModel(tools, 'gpt-5-mini');
    assert.equal(out.length, 0);
});

test('filterToolsByModel: empty or non-array input is returned unchanged', () => {
    assert.deepEqual(filterToolsByModel([], 'gpt-5'), []);
    assert.equal(filterToolsByModel(null as unknown as unknown[], 'gpt-5'), null);
});
