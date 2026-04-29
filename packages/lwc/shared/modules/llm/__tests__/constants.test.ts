import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    LLM_PROVIDERS,
    DEFAULT_LLM_PROVIDER,
    DEFAULT_PROVIDER_BASE_URLS,
    LLM_PROVIDER_OPTIONS,
    OPENAI_MODEL_OPTIONS,
    INTERNAL_MODEL_OPTIONS,
    ANTHROPIC_MODEL_OPTIONS,
    GEMINI_MODEL_OPTIONS,
    MISTRAL_MODEL_OPTIONS,
    WORKBENCH_MODEL_OPTIONS,
    GROK_MODEL_OPTIONS,
    PROVIDER_MODEL_OPTIONS,
} from '../constants.ts';

test('LLM_PROVIDERS: includes the six known provider ids, no duplicates', () => {
    assert.ok(LLM_PROVIDERS.includes('openai'));
    assert.ok(LLM_PROVIDERS.includes('anthropic'));
    assert.ok(LLM_PROVIDERS.includes('gemini'));
    assert.ok(LLM_PROVIDERS.includes('mistral'));
    assert.ok(LLM_PROVIDERS.includes('grok'));
    assert.ok(LLM_PROVIDERS.includes('workbench'));
    assert.equal(LLM_PROVIDERS.length, new Set(LLM_PROVIDERS).size);
});

test('DEFAULT_LLM_PROVIDER: is a valid provider id', () => {
    assert.equal(DEFAULT_LLM_PROVIDER, 'openai');
    assert.ok(LLM_PROVIDERS.includes(DEFAULT_LLM_PROVIDER));
});

test('DEFAULT_PROVIDER_BASE_URLS: has one entry per provider, all non-empty', () => {
    for (const provider of LLM_PROVIDERS) {
        const url = DEFAULT_PROVIDER_BASE_URLS[provider];
        assert.equal(typeof url, 'string', `${provider} base url`);
        assert.ok(url.length > 0, `${provider} base url non-empty`);
    }
    // External providers use absolute https URLs.
    assert.ok(DEFAULT_PROVIDER_BASE_URLS.openai.startsWith('https://'));
    assert.ok(DEFAULT_PROVIDER_BASE_URLS.anthropic.startsWith('https://'));
    // workbench is proxied via same-origin relative path.
    assert.ok(DEFAULT_PROVIDER_BASE_URLS.workbench.startsWith('/'));
});

test('LLM_PROVIDER_OPTIONS: one entry per provider, label+value both non-empty', () => {
    assert.equal(LLM_PROVIDER_OPTIONS.length, LLM_PROVIDERS.length);
    const values = LLM_PROVIDER_OPTIONS.map(o => o.value);
    assert.equal(values.length, new Set(values).size);
    for (const option of LLM_PROVIDER_OPTIONS) {
        assert.ok(LLM_PROVIDERS.includes(option.value));
        assert.ok(option.label.length > 0);
    }
});

test('PROVIDER_MODEL_OPTIONS: every provider has a non-empty model list that matches provider tag', () => {
    for (const provider of LLM_PROVIDERS) {
        const options = PROVIDER_MODEL_OPTIONS[provider];
        assert.ok(Array.isArray(options), `${provider} must be array`);
        assert.ok(options.length > 0, `${provider} must have at least one model`);
        for (const model of options) {
            assert.equal(model.provider, provider, `${model.value} provider tag`);
            assert.ok(model.label.length > 0, `${model.value} label non-empty`);
            assert.ok(model.value.length > 0, `${model.label} value non-empty`);
        }
    }
});

test('OPENAI_MODEL_OPTIONS + INTERNAL_MODEL_OPTIONS: values are unique within each list', () => {
    for (const list of [
        OPENAI_MODEL_OPTIONS,
        INTERNAL_MODEL_OPTIONS,
        ANTHROPIC_MODEL_OPTIONS,
        GEMINI_MODEL_OPTIONS,
        MISTRAL_MODEL_OPTIONS,
        WORKBENCH_MODEL_OPTIONS,
        GROK_MODEL_OPTIONS,
    ]) {
        const values = list.map(m => m.value);
        assert.equal(values.length, new Set(values).size);
    }
});

test('model options: maxOutputTokens is a positive integer when set', () => {
    for (const list of [
        OPENAI_MODEL_OPTIONS,
        ANTHROPIC_MODEL_OPTIONS,
        GEMINI_MODEL_OPTIONS,
        MISTRAL_MODEL_OPTIONS,
        WORKBENCH_MODEL_OPTIONS,
        GROK_MODEL_OPTIONS,
    ]) {
        for (const model of list) {
            if (model.maxOutputTokens !== undefined) {
                assert.equal(typeof model.maxOutputTokens, 'number');
                assert.ok(model.maxOutputTokens > 0);
                assert.equal(Math.floor(model.maxOutputTokens), model.maxOutputTokens);
            }
        }
    }
});
