import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';

import {
    assertAuthorizedAutomationRequest,
    normalizeAutomationHost,
    readBoundedJsonBody,
} from './desktopAutomationSecurity';

test('normalizeAutomationHost keeps loopback hosts only', () => {
    assert.equal(normalizeAutomationHost(undefined), '127.0.0.1');
    assert.equal(normalizeAutomationHost('127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeAutomationHost('http://localhost'), 'localhost');
    assert.equal(normalizeAutomationHost('0.0.0.0'), '127.0.0.1');
    assert.equal(normalizeAutomationHost('192.168.1.10'), '127.0.0.1');
});

test('assertAuthorizedAutomationRequest accepts matching bearer tokens', () => {
    assert.doesNotThrow(() =>
        assertAuthorizedAutomationRequest({ authorization: 'Bearer local-token' }, 'local-token')
    );
});

test('assertAuthorizedAutomationRequest rejects missing or mismatched bearer tokens', () => {
    assert.throws(
        () => assertAuthorizedAutomationRequest({}, 'local-token'),
        /Unauthorized desktop automation request/
    );
    assert.throws(
        () =>
            assertAuthorizedAutomationRequest(
                { authorization: 'Bearer different-token' },
                'local-token'
            ),
        /Unauthorized desktop automation request/
    );
});

test('readBoundedJsonBody rejects payloads over the configured byte limit', async () => {
    const stream = Readable.from([Buffer.from('{"payload":"too-large"}')]);

    await assert.rejects(
        () => readBoundedJsonBody(stream, 8),
        /Automation request body is too large/
    );
});
