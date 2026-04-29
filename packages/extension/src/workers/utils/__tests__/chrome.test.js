import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeChrome({ pingResponse, pingDelay = 0, pingThrows = null, executeThrows = null } = {}) {
    const calls = { sendMessage: [], executeScript: [] };
    globalThis.chrome = {
        tabs: {
            sendMessage: (tabId, msg) => {
                calls.sendMessage.push({ tabId, msg });
                if (pingThrows) return Promise.reject(pingThrows);
                return new Promise(resolve => setTimeout(() => resolve(pingResponse), pingDelay));
            },
        },
        scripting: {
            executeScript: opts => {
                calls.executeScript.push(opts);
                if (executeThrows) return Promise.reject(executeThrows);
                return Promise.resolve();
            },
        },
    };
    return calls;
}

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
console.log = () => {};
console.error = () => {};
console.warn = () => {};

const { injectContentScript, sendMessageToTab, TOOL_MESSAGE_TYPES } = await import('../chrome.js');

test.after(() => {
    console.log = origLog;
    console.error = origErr;
    console.warn = origWarn;
});

test('injectContentScript: skips executeScript when ping returns pong', async () => {
    const calls = makeChrome({ pingResponse: { status: 'pong' } });
    const ctx = { name: 'myAction' };
    await injectContentScript.call(ctx, 99, ['foo.js']);
    assert.equal(calls.sendMessage.length, 1);
    assert.equal(calls.sendMessage[0].msg.action, 'myAction_ping');
    assert.equal(calls.executeScript.length, 0);
});

test('injectContentScript: executes scripting when ping returns unexpected payload', async () => {
    const calls = makeChrome({ pingResponse: { status: 'unexpected' } });
    const ctx = { name: 'x' };
    await injectContentScript.call(ctx, 1, ['a.js', 'b.js'], true, 'MAIN');
    assert.equal(calls.executeScript.length, 1);
    assert.deepEqual(calls.executeScript[0].target, { tabId: 1 });
    assert.deepEqual(calls.executeScript[0].files, ['a.js', 'b.js']);
    assert.equal(calls.executeScript[0].injectImmediately, true);
    assert.equal(calls.executeScript[0].world, 'MAIN');
});

test('injectContentScript: executes scripting when ping rejects', async () => {
    const calls = makeChrome({ pingThrows: new Error('no listener') });
    const ctx = { name: 'x' };
    await injectContentScript.call(ctx, 2, ['c.js']);
    assert.equal(calls.executeScript.length, 1);
});

test('injectContentScript: throws with descriptive message when executeScript fails', async () => {
    makeChrome({ pingResponse: null, executeThrows: new Error('denied') });
    const ctx = { name: 'x' };
    await assert.rejects(
        injectContentScript.call(ctx, 3, ['d.js']),
        /Failed to inject content script in tab 3: denied/
    );
});

test('sendMessageToTab: returns successful response', async () => {
    globalThis.chrome = {
        tabs: { sendMessage: async () => ({ data: 'hello' }) },
    };
    const r = await sendMessageToTab(5, { action: 'x' });
    assert.deepEqual(r, { data: 'hello' });
});

test('sendMessageToTab: throws when response contains error field', async () => {
    globalThis.chrome = {
        tabs: { sendMessage: async () => ({ error: 'boom' }) },
    };
    await assert.rejects(sendMessageToTab(5, { action: 'x' }), /boom/);
});

test('sendMessageToTab: rethrows Error instances', async () => {
    globalThis.chrome = {
        tabs: {
            sendMessage: async () => {
                throw new Error('transport failure');
            },
        },
    };
    await assert.rejects(sendMessageToTab(5, { action: 'x' }), /transport failure/);
});

test('TOOL_MESSAGE_TYPES: contains expected message keys', () => {
    assert.equal(TOOL_MESSAGE_TYPES.CLICK_ELEMENT, 'clickElement');
    assert.equal(TOOL_MESSAGE_TYPES.WEB_FETCHER_GET_HTML_CONTENT, 'getHtmlContent');
    assert.equal(TOOL_MESSAGE_TYPES.SIMILARITY_ENGINE_INIT, 'similarityEngineInit');
});
