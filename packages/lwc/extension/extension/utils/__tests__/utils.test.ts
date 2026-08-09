import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    isEmpty,
    getSfPathFromUrl,
    loadConfiguration,
    PANELS,
    getCurrentTab,
    getCurrentObjectType,
    chromeOpenInWindow,
} from '../utils.ts';

// Small helper to let fire-and-forget chrome-callback chains (used inside
// chromeOpenInWindow's "new window" branch) flush before we assert on them.
function flushMicrotasks() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function makeChrome({
    windows = [],
    newWindow = { id: 'new-window-id' },
    tabGroupsForWindow = {},
    newTabId = 'tab-id',
    groupIdForNew = 'new-group-id',
} = {}) {
    const calls = {
        windowsGetAll: [],
        windowsCreate: [],
        tabsCreate: [],
        tabsQuery: [],
        tabsGroup: [],
        tabGroupsQuery: [],
        tabGroupsUpdate: [],
    };
    globalThis.chrome = {
        windows: {
            getAll: opts => {
                calls.windowsGetAll.push(opts);
                return Promise.resolve(windows);
            },
            create: opts => {
                calls.windowsCreate.push(opts);
                return Promise.resolve(newWindow);
            },
        },
        tabs: {
            create: opts => {
                calls.tabsCreate.push(opts);
                return Promise.resolve({ id: newTabId });
            },
            query: (opts, cb) => {
                calls.tabsQuery.push(opts);
                const tabs = [{ id: newTabId }];
                if (cb) cb(tabs);
                return Promise.resolve(tabs);
            },
            group: (opts, cb) => {
                calls.tabsGroup.push(opts);
                const newGroupId = groupIdForNew;
                if (cb) {
                    cb(newGroupId);
                    return undefined;
                }
                return Promise.resolve(newGroupId);
            },
        },
        tabGroups: {
            query: opts => {
                calls.tabGroupsQuery.push(opts);
                return Promise.resolve(tabGroupsForWindow[opts.windowId] || []);
            },
            update: (groupId, opts, cb) => {
                calls.tabGroupsUpdate.push({ groupId, opts });
                if (cb) cb();
                return Promise.resolve();
            },
        },
    };
    return calls;
}

const origWarn = console.warn;
console.warn = () => {};
test.after(() => {
    console.warn = origWarn;
});

test('isEmpty: empty string returns true', () => {
    assert.equal(isEmpty(''), true);
});

test('isEmpty: null/undefined returns true', () => {
    assert.equal(isEmpty(null as any), true);
    assert.equal(isEmpty(undefined as any), true);
});

test('isEmpty: non-empty string returns false', () => {
    assert.equal(isEmpty('a'), false);
});

test('getSfPathFromUrl: returns "/" for chrome-extension:// urls', () => {
    assert.equal(getSfPathFromUrl('chrome-extension://abc/views/app.html'), '/');
});

test('getSfPathFromUrl: returns "/" for moz-extension://', () => {
    assert.equal(getSfPathFromUrl('moz-extension://abc/views/app.html'), '/');
});

test('getSfPathFromUrl: returns pathname for https urls', () => {
    assert.equal(getSfPathFromUrl('https://my.salesforce.com/lightning/setup'), '/lightning/setup');
});

test('getSfPathFromUrl: root pathname maps to /', () => {
    assert.equal(getSfPathFromUrl('https://my.salesforce.com/'), '/');
});

test('loadConfiguration: returns {} for empty input', () => {
    assert.deepEqual(loadConfiguration(''), {});
    assert.deepEqual(loadConfiguration(null as any), {});
});

test('loadConfiguration: parses valid JSON', () => {
    assert.deepEqual(loadConfiguration('{"a":1,"b":"two"}'), { a: 1, b: 'two' });
});

test('loadConfiguration: returns {} on malformed JSON without throwing', () => {
    assert.deepEqual(loadConfiguration('{not json'), {});
});

test('PANELS: exposes salesforce + default keys', () => {
    assert.equal(PANELS.SALESFORCE, 'salesforce');
    assert.equal(PANELS.DEFAULT, 'default');
});

test('getCurrentTab: resolves to the tab returned by chrome.tabs.query', async () => {
    const expectedTab = { id: 42, active: true };
    globalThis.chrome = {
        tabs: {
            query: async () => [expectedTab],
        },
    };
    const tab = await getCurrentTab();
    assert.deepEqual(tab, expectedTab);
});

test('getCurrentTab: resolves to undefined when no tab matches', async () => {
    globalThis.chrome = {
        tabs: {
            query: async () => [],
        },
    };
    const tab = await getCurrentTab();
    assert.equal(tab, undefined);
});

test('getCurrentObjectType: resolves the parsed sobject type on success', async () => {
    const conn = {
        tooling: {
            executeAnonymous: async () => ({
                exceptionMessage: 'Line 1, column 1: Account',
            }),
        },
    };
    const result = await getCurrentObjectType(conn, '001xx000003DGb1AAG');
    assert.equal(result, 'Account');
});

test('getCurrentObjectType: resolves null when the parsed value is the literal string "null"', async () => {
    const conn = {
        tooling: {
            executeAnonymous: async () => ({
                exceptionMessage: 'Line 1, column 1: null',
            }),
        },
    };
    const result = await getCurrentObjectType(conn, 'invalid-id');
    assert.equal(result, null);
});

test('getCurrentObjectType: rejects when executeAnonymous rejects', async () => {
    const boom = new Error('anonymous apex failed');
    const conn = {
        tooling: {
            executeAnonymous: async () => {
                throw boom;
            },
        },
    };
    await assert.rejects(getCurrentObjectType(conn, '001xx000003DGb1AAG'), boom);
});

test('chromeOpenInWindow: no existing window creates a new window, tab, and group', async () => {
    const calls = makeChrome({ windows: [] });
    await chromeOpenInWindow('https://example.com', 'MyGroup');
    await flushMicrotasks();

    assert.equal(calls.windowsGetAll.length, 1);
    assert.equal(calls.windowsCreate.length, 1);
    assert.deepEqual(calls.windowsCreate[0], {
        url: 'https://example.com',
        incognito: false,
    });
    assert.equal(calls.tabsCreate.length, 0);
    assert.equal(calls.tabsQuery.length, 1);
    assert.deepEqual(calls.tabsQuery[0], { windowId: 'new-window-id' });
    assert.equal(calls.tabsGroup.length, 1);
    assert.deepEqual(calls.tabsGroup[0], {
        createProperties: { windowId: 'new-window-id' },
        tabIds: 'tab-id',
    });
    assert.equal(calls.tabGroupsUpdate.length, 1);
    assert.deepEqual(calls.tabGroupsUpdate[0], {
        groupId: 'new-group-id',
        opts: { title: 'MyGroup' },
    });
});

test('chromeOpenInWindow: reuses an existing window and existing matching group', async () => {
    const calls = makeChrome({
        windows: [{ id: 'w1', incognito: false }],
        tabGroupsForWindow: { w1: [{ id: 'existing-group-id', title: 'MyGroup' }] },
    });
    await chromeOpenInWindow('https://example.com', 'MyGroup');

    assert.equal(calls.windowsCreate.length, 0);
    assert.equal(calls.tabsCreate.length, 1);
    assert.deepEqual(calls.tabsCreate[0], { url: 'https://example.com', windowId: 'w1' });
    assert.equal(calls.tabGroupsQuery.length, 1);
    assert.deepEqual(calls.tabGroupsQuery[0], { windowId: 'w1' });
    assert.equal(calls.tabsGroup.length, 1);
    assert.deepEqual(calls.tabsGroup[0], { groupId: 'existing-group-id', tabIds: 'tab-id' });
    // Reusing an existing group does not create/rename a group.
    assert.equal(calls.tabGroupsUpdate.length, 0);
});

test('chromeOpenInWindow: reuses an existing window but creates a new group when none matches', async () => {
    const calls = makeChrome({
        windows: [{ id: 'w1', incognito: false }],
        tabGroupsForWindow: { w1: [{ id: 'other-group-id', title: 'OtherGroup' }] },
    });
    await chromeOpenInWindow('https://example.com', 'MyGroup');

    assert.equal(calls.windowsCreate.length, 0);
    assert.equal(calls.tabsGroup.length, 1);
    assert.deepEqual(calls.tabsGroup[0], { createProperties: {}, tabIds: 'tab-id' });
    assert.equal(calls.tabGroupsUpdate.length, 1);
    assert.deepEqual(calls.tabGroupsUpdate[0], {
        groupId: 'new-group-id',
        opts: { title: 'MyGroup' },
    });
});

test('chromeOpenInWindow: newWindow=true forces a new window even though a matching window exists', async () => {
    const calls = makeChrome({ windows: [{ id: 'w1', incognito: false }] });
    await chromeOpenInWindow('https://example.com', 'MyGroup', false, true);
    await flushMicrotasks();

    assert.equal(calls.tabsCreate.length, 0);
    assert.equal(calls.windowsCreate.length, 1);
    assert.deepEqual(calls.windowsCreate[0], {
        url: 'https://example.com',
        incognito: false,
    });
});

test('chromeOpenInWindow: incognito=true with no incognito window available creates a new incognito window', async () => {
    const calls = makeChrome({ windows: [{ id: 'w1', incognito: false }] });
    await chromeOpenInWindow('https://example.com', 'MyGroup', true, false);
    await flushMicrotasks();

    assert.equal(calls.tabsCreate.length, 0);
    assert.equal(calls.windowsCreate.length, 1);
    assert.deepEqual(calls.windowsCreate[0], {
        url: 'https://example.com',
        incognito: true,
    });
});

test('chromeOpenInWindow: incognito=true reuses an existing incognito window', async () => {
    const calls = makeChrome({ windows: [{ id: 'w-incog', incognito: true }] });
    await chromeOpenInWindow('https://example.com', 'MyGroup', true, false);

    assert.equal(calls.windowsCreate.length, 0);
    assert.equal(calls.tabsCreate.length, 1);
    assert.deepEqual(calls.tabsCreate[0], { url: 'https://example.com', windowId: 'w-incog' });
});

test('chromeOpenInWindow: warns when the browser denies incognito window creation', async () => {
    // Pass `null` (not `undefined`) — destructuring defaults kick in for
    // `undefined`, which would silently restore the default truthy window.
    const calls = makeChrome({ windows: [], newWindow: null });
    let warned = null;
    const origWarn = console.warn;
    console.warn = msg => {
        warned = msg;
    };
    try {
        await chromeOpenInWindow('https://example.com', 'MyGroup', true, false);
    } finally {
        console.warn = origWarn;
    }

    assert.equal(calls.tabsQuery.length, 0);
    assert.equal(calls.tabsGroup.length, 0);
    assert.match(warned, /Authorize the extension/);
});
