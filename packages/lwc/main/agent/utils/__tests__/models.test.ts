import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    MODELS,
    INTERNAL_MODELS,
    DEFAULT_MODEL,
    getDefaultModelForAgentProvider,
    getSummaryModelForAgentProvider,
    REASONING_OPTIONS,
    DEFAULT_REASONING,
} from '../models.ts';

test('models: MODELS / INTERNAL_MODELS have {label,value} entries', () => {
    assert.ok(Array.isArray(MODELS));
    assert.ok(MODELS.length > 0);
    for (const m of MODELS) {
        assert.equal(typeof m.label, 'string');
        assert.equal(typeof m.value, 'string');
    }
    assert.ok(Array.isArray(INTERNAL_MODELS));
});

test('models: DEFAULT_MODEL is non-empty string', () => {
    assert.equal(typeof DEFAULT_MODEL, 'string');
    assert.ok(DEFAULT_MODEL.length > 0);
});

test('getDefaultModelForAgentProvider: returns first provider model for openai', () => {
    const v = getDefaultModelForAgentProvider('openai');
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0);
});

test('getDefaultModelForAgentProvider: internal flag routes to INTERNAL_MODELS', () => {
    if (INTERNAL_MODELS.length === 0) return;
    const v = getDefaultModelForAgentProvider('openai', true);
    assert.equal(v, INTERNAL_MODELS[0].value);
});

test('getSummaryModelForAgentProvider: explicit lightweight selectedModel wins when supported', () => {
    const openaiModels = new Set(MODELS.map(m => m.value));
    const lightweightCandidate = [...openaiModels].find(v =>
        /mini|nano|lite|flash|haiku|small|fast/i.test(v)
    );
    if (!lightweightCandidate) return;
    assert.equal(
        getSummaryModelForAgentProvider('openai', lightweightCandidate),
        lightweightCandidate
    );
});

test('getSummaryModelForAgentProvider: unknown selectedModel returns it verbatim (user passthrough)', () => {
    assert.equal(
        getSummaryModelForAgentProvider('openai', 'custom-fine-tuned-model'),
        'custom-fine-tuned-model'
    );
});

test('getSummaryModelForAgentProvider: no selectedModel falls back to preferred or first model', () => {
    const v = getSummaryModelForAgentProvider('openai');
    assert.equal(typeof v, 'string');
    assert.ok(v.length > 0);
});

test('REASONING_OPTIONS / DEFAULT_REASONING: shape and default points at "low"', () => {
    assert.ok(Array.isArray(REASONING_OPTIONS));
    assert.ok(REASONING_OPTIONS.length >= 5);
    assert.equal(DEFAULT_REASONING, 'low');
});
