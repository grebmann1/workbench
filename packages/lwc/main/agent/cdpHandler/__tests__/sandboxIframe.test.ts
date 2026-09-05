import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isSandboxIframeAlive } from '../sandboxIframe.ts';

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
