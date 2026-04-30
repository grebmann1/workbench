import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractNestedErrorMessage } from '../errorMessage.ts';

test('extractNestedErrorMessage: reads gateway detail.error payloads', () => {
    assert.equal(
        extractNestedErrorMessage({
            detail: {
                error: 'Model missing from endpoint. Expected format: /model/<Model>/<endpoint>. Got: messages',
            },
        }),
        'Model missing from endpoint. Expected format: /model/<Model>/<endpoint>. Got: messages'
    );
});

test('extractNestedErrorMessage: reads JSON strings with detail.error payloads', () => {
    assert.equal(
        extractNestedErrorMessage(
            '{"detail":{"error":"Model missing from endpoint. Expected format: /model/<Model>/<endpoint>. Got: messages"}}'
        ),
        'Model missing from endpoint. Expected format: /model/<Model>/<endpoint>. Got: messages'
    );
});
