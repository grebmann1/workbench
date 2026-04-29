import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    getReasoningConfigFromSelection,
    sanitizePathSegment,
    extensionForMimeType,
    parseDataUrl,
    isAbortLikeError,
    isContextOverflowError,
    cloneMessageForStreaming,
    normalizeToolInputSchema,
} from '../runnerHelpers.ts';

test('getReasoningConfigFromSelection: returns undefined for off/none/falsy', () => {
    assert.equal(getReasoningConfigFromSelection('off'), undefined);
    assert.equal(getReasoningConfigFromSelection('none'), undefined);
    assert.equal(getReasoningConfigFromSelection(''), undefined);
    assert.equal(getReasoningConfigFromSelection(null), undefined);
    assert.equal(getReasoningConfigFromSelection(undefined), undefined);
});

test('getReasoningConfigFromSelection: builds config object for a real level', () => {
    assert.deepEqual(getReasoningConfigFromSelection('high'), {
        reasoningEffort: 'high',
        reasoningSummary: 'auto',
        store: false,
    });
});

test('sanitizePathSegment: replaces unsafe chars with _', () => {
    assert.equal(sanitizePathSegment('foo/bar baz?.txt'), 'foo_bar_baz_.txt');
});

test('sanitizePathSegment: returns fallback for empty input', () => {
    assert.equal(sanitizePathSegment('', 'fallback'), 'fallback');
    assert.equal(sanitizePathSegment('   '), 'item');
});

test('sanitizePathSegment: preserves safe chars', () => {
    assert.equal(sanitizePathSegment('Name-1_v2.ext'), 'Name-1_v2.ext');
});

test('extensionForMimeType: known mapping', () => {
    assert.equal(extensionForMimeType('image/jpeg'), 'jpg');
    assert.equal(extensionForMimeType('image/png'), 'png');
    assert.equal(extensionForMimeType('image/webp'), 'webp');
    assert.equal(extensionForMimeType('image/gif'), 'gif');
    assert.equal(extensionForMimeType('image/svg+xml'), 'svg');
});

test('extensionForMimeType: unknown returns fallback', () => {
    assert.equal(extensionForMimeType('application/octet-stream'), 'bin');
    assert.equal(extensionForMimeType('text/plain', 'txt'), 'txt');
});

test('parseDataUrl: valid base64 data URL', () => {
    const out = parseDataUrl('data:image/png;base64,QUJD');
    assert.deepEqual(out, { mediaType: 'image/png', base64: 'QUJD' });
});

test('parseDataUrl: returns null for non-base64, non-string, or malformed input', () => {
    assert.equal(parseDataUrl('data:text/plain,hello'), null);
    assert.equal(parseDataUrl(''), null);
    assert.equal(parseDataUrl(null as unknown as string), null);
    assert.equal(parseDataUrl(123 as unknown as string), null);
    assert.equal(parseDataUrl('plain string'), null);
});

test('isAbortLikeError: detects AbortError by name or message', () => {
    assert.equal(isAbortLikeError({ name: 'AbortError' }), true);
    assert.equal(isAbortLikeError({ message: 'The operation was aborted' }), true);
    assert.equal(isAbortLikeError({ name: 'TypeError' }), false);
    assert.equal(isAbortLikeError(null), false);
});

test('isContextOverflowError: recognises known overflow phrases', () => {
    assert.equal(isContextOverflowError({ message: 'prompt is too long' }), true);
    assert.equal(isContextOverflowError({ message: 'context length exceeded' }), true);
    assert.equal(
        isContextOverflowError({ message: 'maximum context length is 8192 tokens' }),
        true
    );
    assert.equal(isContextOverflowError({ message: 'random network timeout' }), false);
    assert.equal(isContextOverflowError(null), false);
});

test('cloneMessageForStreaming: returns {} for non-objects', () => {
    assert.deepEqual(cloneMessageForStreaming(null), {});
    assert.deepEqual(cloneMessageForStreaming('x'), {});
    assert.deepEqual(cloneMessageForStreaming(undefined), {});
});

test('cloneMessageForStreaming: shallow-clones parts and content arrays', () => {
    const original = {
        id: '1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'hi' }],
        content: [{ type: 'text', text: 'world' }],
    };
    const clone = cloneMessageForStreaming(original);
    assert.notEqual(clone.parts, original.parts);
    assert.notEqual(clone.parts[0], original.parts[0]);
    assert.equal(clone.parts[0].text, 'hi');
    assert.notEqual(clone.content, original.content);
    assert.equal(clone.content[0].text, 'world');
});

test('normalizeToolInputSchema: passes through non-null schema', () => {
    const existing = { type: 'object' };
    const zod = { object: () => ({ marker: 'zod-empty' }) };
    assert.equal(normalizeToolInputSchema(existing, zod), existing);
});

test('normalizeToolInputSchema: falls back to zod.object({}) when null', () => {
    const zod = { object: (arg: unknown) => ({ marker: 'zod-empty', arg }) };
    const out = normalizeToolInputSchema(null, zod) as { marker: string; arg: unknown };
    assert.equal(out.marker, 'zod-empty');
    assert.deepEqual(out.arg, {});
});
