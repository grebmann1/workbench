import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    clampEvalTimeoutMs,
    DEFAULT_EVAL_TIMEOUT_MS,
    MAX_EVAL_TIMEOUT_MS,
    MIN_EVAL_TIMEOUT_MS,
    isSandboxIframeAlive,
} from '../sandboxIframe.ts';

test('isSandboxIframeAlive: false when iframe is missing', () => {
    assert.equal(isSandboxIframeAlive(null), false);
});

test('isSandboxIframeAlive: false when contentWindow is gone', () => {
    assert.equal(isSandboxIframeAlive({ contentWindow: null, isConnected: true }), false);
});

test('isSandboxIframeAlive: false when iframe was detached from the document', () => {
    assert.equal(isSandboxIframeAlive({ contentWindow: {}, isConnected: false }), false);
});

test('isSandboxIframeAlive: true when window exists and iframe is connected', () => {
    assert.equal(isSandboxIframeAlive({ contentWindow: {}, isConnected: true }), true);
});

test('isSandboxIframeAlive: true when isConnected is omitted but window exists', () => {
    assert.equal(isSandboxIframeAlive({ contentWindow: {} }), true);
});

test('clampEvalTimeoutMs: defaults, clamps min/max, ignores non-finite', () => {
    assert.equal(clampEvalTimeoutMs(), DEFAULT_EVAL_TIMEOUT_MS);
    assert.equal(clampEvalTimeoutMs(undefined), DEFAULT_EVAL_TIMEOUT_MS);
    assert.equal(clampEvalTimeoutMs(Number.NaN), DEFAULT_EVAL_TIMEOUT_MS);
    assert.equal(clampEvalTimeoutMs(0), MIN_EVAL_TIMEOUT_MS);
    assert.equal(clampEvalTimeoutMs(500), MIN_EVAL_TIMEOUT_MS);
    assert.equal(clampEvalTimeoutMs(30_000), 30_000);
    assert.equal(clampEvalTimeoutMs(999_999), MAX_EVAL_TIMEOUT_MS);
});
