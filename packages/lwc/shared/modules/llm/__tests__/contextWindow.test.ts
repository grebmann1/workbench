import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getContextWindowForModel } from '../llm.ts';

test('provider context metadata overrides the conservative unknown-model default', () => {
    assert.equal(
        getContextWindowForModel('custom', [
            { value: 'custom', label: 'Custom', provider: 'openai', contextWindow: 1000000 },
        ]),
        1000000
    );
    assert.equal(getContextWindowForModel('unknown'), 128000);
    assert.equal(getContextWindowForModel('gpt-4'), 8192);
    assert.equal(getContextWindowForModel('gpt-4-32k'), 32768);
    assert.equal(
        getContextWindowForModel('custom', [
            { value: 'custom', label: 'Custom', provider: 'openai', contextWindow: NaN },
        ]),
        128000
    );
});
