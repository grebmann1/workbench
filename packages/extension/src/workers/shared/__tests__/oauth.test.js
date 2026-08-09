import assert from 'node:assert/strict';
import { test } from 'node:test';

function makeChrome({ responseUrl, throws, lastError = null } = {}) {
    const calls = [];
    globalThis.chrome = {
        identity: {
            launchWebAuthFlow: opts => {
                calls.push(opts);
                if (throws) return Promise.reject(throws);
                return Promise.resolve(responseUrl);
            },
        },
        runtime: {
            get lastError() {
                return lastError;
            },
        },
    };
    return calls;
}

const { handleLaunchWebAuthFlow } = await import('../oauth.js');

test('handleLaunchWebAuthFlow: extracts code from the query string', async () => {
    makeChrome({ responseUrl: 'https://app.example.com/callback?code=abc123&state=xyz' });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.equal(result.code, 'abc123');
    assert.equal(result.error, null);
    assert.equal(result.errorDescription, null);
    assert.equal(result.responseUrl, 'https://app.example.com/callback?code=abc123&state=xyz');
});

test('handleLaunchWebAuthFlow: passes the requested url and interactive:true to launchWebAuthFlow', async () => {
    const calls = makeChrome({ responseUrl: 'https://app.example.com/callback?code=abc' });
    await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize?x=1' });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], {
        url: 'https://provider.example.com/authorize?x=1',
        interactive: true,
    });
});

test('handleLaunchWebAuthFlow: extracts code from the hash fragment when present there instead of the query', async () => {
    makeChrome({ responseUrl: 'https://app.example.com/callback#code=hashcode789&state=xyz' });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.equal(result.code, 'hashcode789');
});

test('handleLaunchWebAuthFlow: prefers a query-string code over a hash code when both are present', async () => {
    makeChrome({
        responseUrl: 'https://app.example.com/callback?code=queryCode#code=hashCode',
    });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.equal(result.code, 'queryCode');
});

test('handleLaunchWebAuthFlow: surfaces error and error_description from the query string', async () => {
    makeChrome({
        responseUrl:
            'https://app.example.com/callback?error=access_denied&error_description=User%20declined',
    });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.equal(result.code, null);
    assert.equal(result.error, 'access_denied');
    assert.equal(result.errorDescription, 'User declined');
});

test('handleLaunchWebAuthFlow: surfaces error and error_description from the hash fragment', async () => {
    makeChrome({
        responseUrl:
            'https://app.example.com/callback#error=server_error&error_description=Something%20broke',
    });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.equal(result.error, 'server_error');
    assert.equal(result.errorDescription, 'Something broke');
});

test('handleLaunchWebAuthFlow: returns an "OAuth flow canceled" error when responseUrl is falsy (user closed popup)', async () => {
    makeChrome({ responseUrl: undefined });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.deepEqual(result, { error: 'OAuth flow canceled' });
});

test('handleLaunchWebAuthFlow: returns chrome.runtime.lastError.message when set, even if a responseUrl came back', async () => {
    makeChrome({
        responseUrl: 'https://app.example.com/callback?code=abc',
        lastError: { message: 'Authorization page could not be loaded.' },
    });
    const result = await handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' });
    assert.deepEqual(result, { error: 'Authorization page could not be loaded.' });
});

test('handleLaunchWebAuthFlow: propagates a rejected launchWebAuthFlow promise as a thrown error', async () => {
    makeChrome({ throws: new Error('user closed the window') });
    await assert.rejects(
        handleLaunchWebAuthFlow({ url: 'https://provider.example.com/authorize' }),
        /user closed the window/
    );
});
