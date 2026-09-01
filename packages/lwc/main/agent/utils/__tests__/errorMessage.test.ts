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

test('extractNestedErrorMessage: surfaces Zod issue paths from a swallowed cause', () => {
    // Mirrors the AI SDK InvalidPromptError -> TypeValidationError -> ZodError chain.
    const invalidPrompt = {
        message: 'Invalid prompt: The messages do not match the ModelMessage[] schema.',
        cause: {
            name: 'TypeValidationError',
            cause: {
                name: 'ZodError',
                issues: [{ path: [2, 'content', 1, 'text'], message: 'Expected string' }],
            },
        },
    };
    assert.equal(
        extractNestedErrorMessage(invalidPrompt),
        'Invalid prompt: The messages do not match the ModelMessage[] schema. ([2].content[1].text: Expected string)'
    );
});

test('extractNestedErrorMessage: flattens nested Zod union branch errors', () => {
    // Zod v4 nests each union branch under issue.errors (array of issue arrays).
    const zodError = {
        issues: [
            {
                code: 'invalid_union',
                path: [3],
                errors: [[{ path: ['content', 0, 'toolName'], message: 'Required' }]],
            },
        ],
    };
    assert.equal(extractNestedErrorMessage(zodError), '[3].content[0].toolName: Required');
});
