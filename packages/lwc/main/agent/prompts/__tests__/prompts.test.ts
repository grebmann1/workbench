import assert from 'node:assert/strict';
import { test } from 'node:test';

import { SUMMARIZATION_PROMPT } from '../summarizationPrompt.ts';
import { SUMMARIZATION_SYSTEM_PROMPT } from '../summarizationSystemPrompt.ts';
import { TURN_PREFIX_SUMMARIZATION_PROMPT } from '../turnPrefixSummarizationPrompt.ts';
import { UPDATE_SUMMARIZATION_PROMPT } from '../updateSummarizationPrompt.ts';
import { browserAgentInstructions } from '../../agents/instructions/browserAgentInstructions.ts';

test('SUMMARIZATION_PROMPT: declares the required headings consumers rely on', () => {
    for (const heading of [
        '## Goal',
        '## Constraints & Preferences',
        '## Progress',
        '### Done',
        '### In Progress',
        '### Blocked',
        '## Key Decisions',
        '## Next Steps',
        '## Critical Context',
    ]) {
        assert.ok(
            SUMMARIZATION_PROMPT.includes(heading),
            `SUMMARIZATION_PROMPT missing heading: ${heading}`
        );
    }
});

test('SUMMARIZATION_PROMPT: asks for the exact format + preservation rules', () => {
    assert.match(SUMMARIZATION_PROMPT, /EXACT format/);
    assert.match(SUMMARIZATION_PROMPT, /file paths/);
    assert.match(SUMMARIZATION_PROMPT, /error messages/);
});

test('SUMMARIZATION_SYSTEM_PROMPT: forbids continuing the conversation', () => {
    assert.match(SUMMARIZATION_SYSTEM_PROMPT, /Do NOT continue/);
    assert.match(SUMMARIZATION_SYSTEM_PROMPT, /ONLY output/);
});

test('TURN_PREFIX_SUMMARIZATION_PROMPT: references prefix + retained suffix', () => {
    assert.match(TURN_PREFIX_SUMMARIZATION_PROMPT, /PREFIX of a turn/);
    assert.match(TURN_PREFIX_SUMMARIZATION_PROMPT, /SUFFIX \(recent work\) is retained/);
    assert.ok(TURN_PREFIX_SUMMARIZATION_PROMPT.includes('## Original Request'));
    assert.ok(TURN_PREFIX_SUMMARIZATION_PROMPT.includes('## Early Progress'));
    assert.ok(TURN_PREFIX_SUMMARIZATION_PROMPT.includes('## Context for Suffix'));
});

test('UPDATE_SUMMARIZATION_PROMPT: references <previous-summary> tag + preservation rules', () => {
    assert.ok(UPDATE_SUMMARIZATION_PROMPT.includes('<previous-summary>'));
    assert.match(UPDATE_SUMMARIZATION_PROMPT, /PRESERVE/);
    assert.match(UPDATE_SUMMARIZATION_PROMPT, /ADD/);
    assert.match(UPDATE_SUMMARIZATION_PROMPT, /UPDATE/);
});

test('all prompts: are non-empty strings with no stray control characters', () => {
    // eslint-disable-next-line no-control-regex
    const controlRegex = /[\u0000-\u0008\u000B-\u001F]/;
    for (const [name, value] of [
        ['SUMMARIZATION_PROMPT', SUMMARIZATION_PROMPT],
        ['SUMMARIZATION_SYSTEM_PROMPT', SUMMARIZATION_SYSTEM_PROMPT],
        ['TURN_PREFIX_SUMMARIZATION_PROMPT', TURN_PREFIX_SUMMARIZATION_PROMPT],
        ['UPDATE_SUMMARIZATION_PROMPT', UPDATE_SUMMARIZATION_PROMPT],
    ] as const) {
        assert.equal(typeof value, 'string', name);
        assert.ok(value.length > 0, `${name} must be non-empty`);
        assert.ok(!controlRegex.test(value), `${name} has control character`);
    }
});

test('browserAgentInstructions: reduced length stays within slim budget', () => {
    // Before prompt split this prompt was ~62k chars.
    const beforeLength = 62000;
    const afterLength = browserAgentInstructions.length;
    assert.ok(afterLength < beforeLength, `expected ${afterLength} to be < ${beforeLength}`);
    assert.ok(afterLength < 10000, `expected slimmed prompt < 10000 chars, got ${afterLength}`);
});

test('browserAgentInstructions: tells the agent how to inspect the current tab', () => {
    assert.match(browserAgentInstructions, /listTabs\(\)/);
    assert.match(browserAgentInstructions, /getCurrentTab\(\)/);
    assert.match(browserAgentInstructions, /connectToPage/);
    assert.match(browserAgentInstructions, /top-level `await`/);
    assert.match(browserAgentInstructions, /js <<'EOF'/);
    assert.doesNotMatch(browserAgentInstructions, /chrome_screenshot.*work normally/);
});
