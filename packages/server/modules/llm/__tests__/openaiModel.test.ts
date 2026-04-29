import assert from 'node:assert/strict';
import { test } from 'node:test';

import { openai } from '../openaiModel.ts';

test('openai: returns shape with name, supportModels, requiredEnv', () => {
    const model = openai({ OPENAI_KEY: 'test' } as any);
    assert.equal(model.name, 'openai');
    assert.ok(Array.isArray(model.supportModels));
    assert.ok(model.supportModels.length > 0);
    assert.deepEqual(model.requiredEnv, ['OPENAI_KEY']);
});

test('openai: supportModels contains gpt-5 and gpt-4o families', () => {
    const model = openai({} as any);
    assert.ok(model.supportModels.includes('gpt-5'));
    assert.ok(model.supportModels.includes('gpt-4o'));
    assert.ok(model.supportModels.includes('gpt-4o-mini'));
});

test('openai: supportModels includes o-series reasoning models', () => {
    const model = openai({} as any);
    assert.ok(model.supportModels.includes('o1'));
    assert.ok(model.supportModels.includes('o3'));
    assert.ok(model.supportModels.includes('o4-mini'));
});

test('openai: exposes invoke / stream / invokeResponse / streamResponse callables', () => {
    const model = openai({} as any);
    assert.equal(typeof model.invoke, 'function');
    assert.equal(typeof model.stream, 'function');
    assert.equal(typeof model.invokeResponse, 'function');
    assert.equal(typeof model.streamResponse, 'function');
});

test('openai: supportModels entries are all unique', () => {
    const model = openai({} as any);
    const set = new Set(model.supportModels);
    assert.equal(set.size, model.supportModels.length);
});
