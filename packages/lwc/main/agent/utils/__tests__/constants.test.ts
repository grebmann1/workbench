import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Constants, SKILLS_ROOT, SKILLS_INSTRUCTIONS } from '../constants.ts';

test('Constants: exposes tool/menu/sender labels as non-empty strings', () => {
    assert.equal(typeof Constants.ERROR_MESSAGE_DEFAULT, 'string');
    assert.ok(Constants.ERROR_MESSAGE_DEFAULT.length > 0);
    assert.equal(Constants.TOOL_RUNNING_TITLE, 'Calling function');
    assert.equal(Constants.TOOL_FINISHED_TITLE, 'Called function');
    assert.equal(Constants.SENDER_USER, 'You');
    assert.equal(Constants.SENDER_ASSISTANT, 'Assistant');
});

test('Constants.WELCOME_MESSAGE: has assistant role and a single text part', () => {
    assert.equal(Constants.WELCOME_MESSAGE.role, 'assistant');
    assert.equal(Constants.WELCOME_MESSAGE.id, 'WELCOME_MESSAGE_ID');
    assert.ok(Array.isArray(Constants.WELCOME_MESSAGE.parts));
    assert.equal(Constants.WELCOME_MESSAGE.parts.length, 1);
    assert.equal(Constants.WELCOME_MESSAGE.parts[0].type, 'text');
    assert.ok(Constants.WELCOME_MESSAGE.parts[0].text.length > 0);
});

test('Constants.CONTENT_TYPE: every value is a unique lowercase token', () => {
    const values = Object.values(Constants.CONTENT_TYPE);
    const seen = new Set(values);
    assert.equal(values.length, seen.size, 'CONTENT_TYPE duplicates');
    for (const v of values) {
        assert.equal(typeof v, 'string');
        assert.equal(v, v.toLowerCase());
    }
});

test('Constants.MESSAGE_TYPE + STREAM_CHUNK_TYPE: values are unique non-empty strings', () => {
    for (const group of [Constants.MESSAGE_TYPE, Constants.STREAM_CHUNK_TYPE]) {
        const values = Object.values(group);
        const seen = new Set(values);
        assert.equal(values.length, seen.size);
        for (const v of values) {
            assert.equal(typeof v, 'string');
            assert.ok((v as string).length > 0);
        }
    }
});

test('Constants.SCROLL_THRESHOLD: is a small positive integer', () => {
    assert.equal(typeof Constants.SCROLL_THRESHOLD, 'number');
    assert.ok(Constants.SCROLL_THRESHOLD > 0 && Constants.SCROLL_THRESHOLD < 1000);
});

test('SKILLS_ROOT: points at /workspace/skills', () => {
    assert.equal(SKILLS_ROOT, '/workspace/skills');
});

test('SKILLS_INSTRUCTIONS: references available_skills tag + SKILL.md', () => {
    assert.ok(SKILLS_INSTRUCTIONS.includes('<available_skills>'));
    assert.ok(SKILLS_INSTRUCTIONS.includes('SKILL.md'));
});

test('Constants.TOOL_ICON_PREVIEW/HIDE: match utility SLDS icon namespace', () => {
    assert.match(Constants.TOOL_ICON_PREVIEW, /^utility:/);
    assert.match(Constants.TOOL_ICON_HIDE, /^utility:/);
});

test('Constants.REASONING_LABEL_*: non-empty human-facing labels', () => {
    assert.equal(Constants.REASONING_LABEL_THINKING, 'Thinking');
    assert.ok(Constants.REASONING_LABEL_THOUGHT_FOR.length > 0);
    assert.ok(Constants.REASONING_LABEL_THOUGHT_BRIEFLY.length > 0);
});
