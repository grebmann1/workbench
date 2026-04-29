import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    instructionFormatted,
    separator_token,
    chat_template,
} from '../modules/templates/assistant.ts';

test('instructionFormatted: returns the joined instructions string', () => {
    const out = instructionFormatted();
    assert.equal(typeof out, 'string');
    assert.ok(out.length > 0);
    assert.ok(out.includes('Try to be precise'));
    assert.ok(out.includes('Mermaid'));
    assert.ok(out.includes('This is the User Request:'));
});

test('separator_token: is a non-empty string distinct from common tokens', () => {
    assert.equal(typeof separator_token, 'string');
    assert.ok(separator_token.length > 5);
    // Should not collide with natural language characters that may appear in model output.
    assert.ok(!/^[\s]+$/.test(separator_token));
});

test('chat_template: embeds the model name', () => {
    const out = chat_template('llama-2', [{ role: 'user', content: 'hi' }]);
    assert.ok(out.includes("request.modelName = 'llama-2'"));
});

test('chat_template: emits per-message items with indexed variable names', () => {
    const out = chat_template('m', [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'world' },
    ]);
    assert.ok(out.includes('item_0'));
    assert.ok(out.includes('item_1'));
    assert.ok(out.includes("item_0.role = 'user'"));
    assert.ok(out.includes("item_1.role = 'assistant'"));
});

test('chat_template: user messages are wrapped with instructions + triple-quoted body', () => {
    const out = chat_template('m', [{ role: 'user', content: 'hi there' }]);
    // User message content begins with the first instruction line.
    assert.ok(out.includes('Try to be precise'));
    // And ends with triple-quoted content.
    assert.ok(out.includes('"""hi there"""'));
});

test('chat_template: assistant messages are emitted raw (no instructions/triple-quote)', () => {
    const out = chat_template('m', [{ role: 'assistant', content: 'answer' }]);
    assert.ok(out.includes("item_0.content = 'answer'"));
    assert.ok(!out.includes('"""answer"""'));
});

test('chat_template: escapes single quotes in message content', () => {
    const out = chat_template('m', [{ role: 'assistant', content: "it's here" }]);
    // Apex-escaped single quote: \'
    assert.ok(out.includes("it\\'s here"));
});

test('chat_template: escapes newlines in message content', () => {
    const out = chat_template('m', [{ role: 'assistant', content: 'line1\nline2' }]);
    assert.ok(out.includes('line1\\nline2'));
});

test('chat_template: includes the separator_token in the debug line', () => {
    const out = chat_template('m', []);
    assert.ok(out.includes(separator_token));
    assert.ok(out.includes('START_EINSTEIN_TOOLKIT'));
    assert.ok(out.includes('END_EINSTEIN_TOOLKIT'));
});

test('chat_template: handles empty messages array (no item_ entries)', () => {
    const out = chat_template('m', []);
    assert.ok(!out.includes('item_0'));
    assert.ok(out.includes('body.messages = messagesList'));
});
