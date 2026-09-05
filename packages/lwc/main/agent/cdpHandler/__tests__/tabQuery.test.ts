import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mapTabForSandbox, queryActiveTabForAgent, queryTabsForAgent } from '../tabQuery.ts';

function makeTabsApi(byQuery) {
    return {
        query: async queryInfo => {
            const key = JSON.stringify(queryInfo);
            if (!(key in byQuery)) {
                throw new Error(`unexpected chrome.tabs.query: ${key}`);
            }
            return byQuery[key];
        },
    };
}

test('queryTabsForAgent: prefers lastFocusedWindow tabs over currentWindow', async () => {
    const focused = [{ id: 7, title: 'Quiz', url: 'https://quiz.example', active: true }];
    const tabs = await queryTabsForAgent(
        makeTabsApi({
            '{"lastFocusedWindow":true}': focused,
            '{}': [{ id: 99, title: 'Other', url: 'https://other.example', active: true }],
        })
    );
    assert.deepEqual(tabs, focused);
});

test('queryTabsForAgent: falls back to all tabs when lastFocusedWindow is empty', async () => {
    const all = [
        { id: 1, title: 'A', url: 'https://a.example', active: false },
        { id: 2, title: 'B', url: 'https://b.example', active: true },
    ];
    const tabs = await queryTabsForAgent(
        makeTabsApi({
            '{"lastFocusedWindow":true}': [],
            '{}': all,
        })
    );
    assert.deepEqual(tabs, all);
});

test('queryTabsForAgent: returns [] when chrome.tabs is unavailable', async () => {
    const tabs = await queryTabsForAgent(null);
    assert.deepEqual(tabs, []);
});

test('queryActiveTabForAgent: uses lastFocusedWindow, not currentWindow', async () => {
    const focused = { id: 42, title: 'Quiz', url: 'https://quiz.example', active: true };
    const tab = await queryActiveTabForAgent(
        makeTabsApi({
            '{"active":true,"lastFocusedWindow":true}': [focused],
        })
    );
    assert.deepEqual(tab, focused);
});

test('queryActiveTabForAgent: falls back to any active tab', async () => {
    const fallback = { id: 8, title: 'Other', url: 'https://other.example', active: true };
    const tab = await queryActiveTabForAgent(
        makeTabsApi({
            '{"active":true,"lastFocusedWindow":true}': [],
            '{"active":true}': [fallback],
        })
    );
    assert.deepEqual(tab, fallback);
});

test('mapTabForSandbox: keeps the fields the sandbox listTabs contract uses', () => {
    assert.deepEqual(
        mapTabForSandbox({
            id: 3,
            title: 'Quiz',
            url: 'https://quiz.example',
            active: true,
            windowId: 1,
        }),
        { id: 3, title: 'Quiz', url: 'https://quiz.example', active: true }
    );
});
