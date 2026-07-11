import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    IFRAME_AI_BRIDGE_PROTOCOL,
    IFRAME_AI_BRIDGE_VERSION,
    IFRAME_AI_BRIDGE_METHODS,
    isIframeAiBridgeEnvelope,
    isIframeAiBridgeMethod,
    toIframeAiBridgeError,
} from '../iframeAiBridgeContract.ts';
import {
    IFRAME_FS_BRIDGE_PROTOCOL,
    IFRAME_FS_BRIDGE_VERSION,
    IFRAME_FS_BRIDGE_METHODS,
    isIframeFsBridgeEnvelope,
    isIframeFsBridgeMethod,
    toIframeFsBridgeError,
} from '../iframeFsBridgeContract.ts';
import {
    IFRAME_JSFORCE_BRIDGE_PROTOCOL,
    IFRAME_JSFORCE_BRIDGE_VERSION,
    IFRAME_JSFORCE_BRIDGE_METHODS,
    isIframeJsforceBridgeEnvelope,
    isIframeJsforceBridgeMethod,
    toIframeJsforceBridgeError,
} from '../iframeJsforceBridgeContract.ts';

// ── FS bridge ────────────────────────────────────────────────────────────────

test('isIframeFsBridgeEnvelope: true for matching protocol + version + type', () => {
    assert.equal(
        isIframeFsBridgeEnvelope({
            protocol: IFRAME_FS_BRIDGE_PROTOCOL,
            version: IFRAME_FS_BRIDGE_VERSION,
            type: 'fsRequest',
        }),
        true
    );
});

test('isIframeFsBridgeEnvelope: false for non-object, wrong protocol, wrong version, or missing type', () => {
    assert.equal(isIframeFsBridgeEnvelope(null), false);
    assert.equal(isIframeFsBridgeEnvelope([]), false);
    assert.equal(isIframeFsBridgeEnvelope('x'), false);
    assert.equal(
        isIframeFsBridgeEnvelope({
            protocol: 'nope',
            version: IFRAME_FS_BRIDGE_VERSION,
            type: 'fsRequest',
        }),
        false
    );
    assert.equal(
        isIframeFsBridgeEnvelope({
            protocol: IFRAME_FS_BRIDGE_PROTOCOL,
            version: 999,
            type: 'fsRequest',
        }),
        false
    );
    assert.equal(
        isIframeFsBridgeEnvelope({
            protocol: IFRAME_FS_BRIDGE_PROTOCOL,
            version: IFRAME_FS_BRIDGE_VERSION,
        }),
        false
    );
});

test('isIframeFsBridgeMethod: accepts declared methods, rejects others', () => {
    for (const method of IFRAME_FS_BRIDGE_METHODS) {
        assert.equal(isIframeFsBridgeMethod(method), true, method);
    }
    assert.equal(isIframeFsBridgeMethod('not.a.method'), false);
    assert.equal(isIframeFsBridgeMethod(42), false);
});

test('toIframeFsBridgeError: preserves code/message from a record error', () => {
    const out = toIframeFsBridgeError({ code: 'ENOENT', message: 'missing' });
    assert.deepEqual(out, { code: 'ENOENT', message: 'missing' });
});

test('toIframeFsBridgeError: applies fallbacks when record fields are blank', () => {
    const out = toIframeFsBridgeError({ code: '', message: '   ' });
    assert.equal(out.code, 'EUNKNOWN');
    assert.equal(out.message, 'Bridge operation failed.');
});

test('toIframeFsBridgeError: unwraps Error instance', () => {
    const err = new Error('boom');
    const out = toIframeFsBridgeError(err, 'ECODE');
    assert.deepEqual(out, { code: 'ECODE', message: 'boom' });
});

test('toIframeFsBridgeError: string error becomes the message', () => {
    assert.deepEqual(toIframeFsBridgeError('raw msg'), {
        code: 'EUNKNOWN',
        message: 'raw msg',
    });
});

test('toIframeFsBridgeError: null/undefined uses fallback message', () => {
    assert.deepEqual(toIframeFsBridgeError(null), {
        code: 'EUNKNOWN',
        message: 'Bridge operation failed.',
    });
});

// ── Jsforce bridge ───────────────────────────────────────────────────────────

test('isIframeJsforceBridgeEnvelope: true for matching envelope', () => {
    assert.equal(
        isIframeJsforceBridgeEnvelope({
            protocol: IFRAME_JSFORCE_BRIDGE_PROTOCOL,
            version: IFRAME_JSFORCE_BRIDGE_VERSION,
            type: 'jsforceRequest',
        }),
        true
    );
});

test('isIframeJsforceBridgeEnvelope: false for mismatching protocol', () => {
    assert.equal(
        isIframeJsforceBridgeEnvelope({
            protocol: 'other',
            version: IFRAME_JSFORCE_BRIDGE_VERSION,
            type: 'x',
        }),
        false
    );
});

test('isIframeJsforceBridgeMethod: accepts known SOQL/metadata methods', () => {
    assert.equal(isIframeJsforceBridgeMethod('soql.execute'), true);
    assert.equal(isIframeJsforceBridgeMethod('metadata.list'), true);
    assert.equal(isIframeJsforceBridgeMethod('bogus.method'), false);
});

test('isIframeJsforceBridgeMethod: accepts split retrieve start/status methods', () => {
    // The split methods keep each bridge hop short so a long retrieve never
    // trips the client request timeout; both must be recognized.
    assert.equal(isIframeJsforceBridgeMethod('metadata.retrieveStart'), true);
    assert.equal(isIframeJsforceBridgeMethod('metadata.checkRetrieveStatus'), true);
    assert.ok(IFRAME_JSFORCE_BRIDGE_METHODS.includes('metadata.retrieveStart'));
    assert.ok(IFRAME_JSFORCE_BRIDGE_METHODS.includes('metadata.checkRetrieveStatus'));
});

test('toIframeJsforceBridgeError: Error instance with empty message falls back', () => {
    const err = new Error('');
    const out = toIframeJsforceBridgeError(err);
    assert.equal(out.code, 'EUNKNOWN');
    assert.equal(out.message, 'Bridge operation failed.');
});

// ── AI bridge ────────────────────────────────────────────────────────────────

test('isIframeAiBridgeEnvelope: true for matching envelope', () => {
    assert.equal(
        isIframeAiBridgeEnvelope({
            protocol: IFRAME_AI_BRIDGE_PROTOCOL,
            version: IFRAME_AI_BRIDGE_VERSION,
            type: 'aiRequest',
        }),
        true
    );
});

test('isIframeAiBridgeMethod: accepts ai.complete/ai.getConfig only', () => {
    for (const method of IFRAME_AI_BRIDGE_METHODS) {
        assert.equal(isIframeAiBridgeMethod(method), true, method);
    }
    assert.equal(isIframeAiBridgeMethod('ai.stream'), false);
});

test('toIframeAiBridgeError: honors custom fallback code', () => {
    const out = toIframeAiBridgeError({}, 'ECUSTOM', 'fallback');
    assert.deepEqual(out, { code: 'ECUSTOM', message: 'fallback' });
});

test('toIframeAiBridgeError: non-object non-Error becomes fallback code + stringified message', () => {
    const out = toIframeAiBridgeError(42);
    assert.deepEqual(out, { code: 'EUNKNOWN', message: 'Bridge operation failed.' });
});
