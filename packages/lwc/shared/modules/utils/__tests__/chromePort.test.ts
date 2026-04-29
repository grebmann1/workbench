import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getChromePort, registerChromePort, disconnectChromePort } from '../chromePort.ts';

test('getChromePort: null by default', () => {
    disconnectChromePort();
    assert.equal(getChromePort(), null);
});

test('registerChromePort: sets and returns the port', () => {
    const port = { disconnect: () => {} };
    const ret = registerChromePort(port);
    assert.equal(ret, port);
    assert.equal(getChromePort(), port);
    disconnectChromePort();
});

test('disconnectChromePort: calls disconnect and clears singleton', () => {
    let called = 0;
    const port = { disconnect: () => (called += 1) };
    registerChromePort(port);
    disconnectChromePort();
    assert.equal(called, 1);
    assert.equal(getChromePort(), null);
});

test('disconnectChromePort: no-op when no port registered', () => {
    disconnectChromePort();
    assert.doesNotThrow(() => disconnectChromePort());
});
