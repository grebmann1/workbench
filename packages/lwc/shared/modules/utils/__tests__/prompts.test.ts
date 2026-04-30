import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RECOMMENDED_PROMPT_PREFIX, promptWithHandoffInstructions } from '../prompts.ts';

test('RECOMMENDED_PROMPT_PREFIX: mentions Agents SDK + handoff vocabulary', () => {
    assert.match(RECOMMENDED_PROMPT_PREFIX, /Agents SDK/);
    assert.match(RECOMMENDED_PROMPT_PREFIX, /Handoffs/);
    assert.match(RECOMMENDED_PROMPT_PREFIX, /transfer_to_<agent_name>/);
});

test('promptWithHandoffInstructions: prepends prefix and appends trailing newlines', () => {
    const out = promptWithHandoffInstructions('Hello');
    assert.ok(out.startsWith(RECOMMENDED_PROMPT_PREFIX));
    assert.ok(out.includes('\n\nHello\n\n'));
});

test('promptWithHandoffInstructions: empty prompt still produces well-formed output', () => {
    const out = promptWithHandoffInstructions('');
    assert.ok(out.startsWith(RECOMMENDED_PROMPT_PREFIX));
    assert.ok(out.endsWith('\n\n'));
});
