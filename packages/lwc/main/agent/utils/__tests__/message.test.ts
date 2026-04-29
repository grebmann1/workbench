import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildUserMessageParts,
    createUserModelMessage,
    isUiMessage,
    areMessagesEqual,
    appendMessageIfNotExists,
} from '../message.ts';

test('buildUserMessageParts: plain text becomes a text part', () => {
    const parts = buildUserMessageParts({ text: 'hello', filesData: [] });
    assert.deepEqual(parts, [{ type: 'text', text: 'hello' }]);
});

test('buildUserMessageParts: whitespace-only text is dropped', () => {
    const parts = buildUserMessageParts({ text: '   ', filesData: [] });
    assert.deepEqual(parts, []);
});

test('buildUserMessageParts: image data URL becomes an image part with extracted base64', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [{ type: 'image/png', content: 'data:image/png;base64,QUJD', name: 'x.png' }],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'image');
    assert.equal(parts[0].image, 'QUJD');
    assert.equal(parts[0].mediaType, 'image/png');
});

test('buildUserMessageParts: non-image with base64 data URL becomes a file part', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [
            {
                type: 'application/pdf',
                content: 'data:application/pdf;base64,ZmFrZQ==',
                name: 'a.pdf',
            },
        ],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'file');
    assert.equal(parts[0].data, 'ZmFrZQ==');
    assert.equal(parts[0].mediaType, 'application/pdf');
    assert.equal(parts[0].filename, 'a.pdf');
});

test('buildUserMessageParts: text file with raw content keeps mediaType and data', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [{ type: 'text/plain', content: 'hello world', name: 'a.txt' }],
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0].type, 'file');
    assert.equal(parts[0].data, 'hello world');
    assert.equal(parts[0].mediaType, 'text/plain');
});

test('buildUserMessageParts: skips files missing content or type', () => {
    const parts = buildUserMessageParts({
        text: '',
        filesData: [
            { type: '', content: 'abc' },
            { type: 'text/plain', content: '' },
            null,
            'not an object',
        ],
    });
    assert.deepEqual(parts, []);
});

test('createUserModelMessage: wraps parts with user role', () => {
    const msg = createUserModelMessage({ text: 'hi', filesData: [] });
    assert.equal(msg.role, 'user');
    assert.deepEqual(msg.content, [{ type: 'text', text: 'hi' }]);
});

test('isUiMessage: true for object with id/role/parts', () => {
    assert.equal(isUiMessage({ id: 'a', role: 'user', parts: [] }), true);
});

test('isUiMessage: false for missing fields or wrong types', () => {
    assert.equal(isUiMessage(null), false);
    assert.equal(isUiMessage(undefined), false);
    assert.equal(isUiMessage('string'), false);
    assert.equal(isUiMessage({ id: 1, role: 'u', parts: [] }), false);
    assert.equal(isUiMessage({ id: 'a', role: 'u', parts: 'not array' }), false);
});

test('areMessagesEqual: matches by id or _key', () => {
    assert.equal(areMessagesEqual({ id: 'a' }, { id: 'a' }), true);
    assert.equal(areMessagesEqual({ _key: 'k' }, { _key: 'k' }), true);
    assert.equal(areMessagesEqual({ id: 'a' }, { id: 'b' }), false);
    assert.equal(areMessagesEqual(null, null), null); // short-circuits on falsy
    assert.equal(areMessagesEqual({ id: undefined }, { id: undefined }), false);
});

test('appendMessageIfNotExists: appends when id/key not present', () => {
    const out = appendMessageIfNotExists([{ id: 'a' }], { id: 'b' });
    assert.equal(out.length, 2);
    assert.equal(out[1].id, 'b');
});

test('appendMessageIfNotExists: no-ops when message already exists', () => {
    const list = [{ id: 'a' }, { id: 'b' }];
    const out = appendMessageIfNotExists(list, { id: 'a' });
    assert.equal(out.length, 2);
    assert.equal(out, list);
});
