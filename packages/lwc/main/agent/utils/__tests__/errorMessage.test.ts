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

test('extractNestedErrorMessage: prefers provider response detail over an SDK object coercion', () => {
    const error = Object.assign(new Error('[object Object]'), {
        name: 'AI_APICallError',
        responseBody: '{"detail":"Unsupported parameter: temperature"}',
    });

    assert.equal(extractNestedErrorMessage(error), 'Unsupported parameter: temperature');
});

test('extractNestedErrorMessage: follows a no-output cause into structured provider messages', () => {
    const error = Object.assign(new Error('No output generated. Check the stream for errors.'), {
        name: 'AI_NoOutputGeneratedError',
        cause: {
            message: '[object Object] [object Object]',
            data: {
                detail: [
                    { message: 'The selected model does not support this request.' },
                    { message: 'Select a supported model.' },
                ],
            },
        },
    });

    assert.equal(
        extractNestedErrorMessage(error),
        'The selected model does not support this request.'
    );
});

test('extractNestedErrorMessage: traverses structured message arrays', () => {
    assert.equal(
        extractNestedErrorMessage({
            message: [{ message: 'Account quota exceeded.' }, { message: 'Try again later.' }],
        }),
        'Account quota exceeded.'
    );
});

test('extractNestedErrorMessage: preserves meaningful outer messages', () => {
    const error = Object.assign(new Error('Request denied for this project.'), {
        responseBody: '{"detail":"Contact the project administrator."}',
    });

    assert.equal(extractNestedErrorMessage(error), 'Request denied for this project.');
});

test('extractNestedErrorMessage: skips cyclic payloads and parses JSON primitive messages', () => {
    const cycle: { error?: unknown; message: string } = { message: 'Bad Request' };
    cycle.error = cycle;

    assert.equal(
        extractNestedErrorMessage({
            error: cycle,
            cause: '"Bad Request"',
            detail: '"123"',
        }),
        '123'
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
