import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRunningEnvironmentContext } from '../environmentContext.ts';

test('side panel context: tells the agent how to inspect the current tab', () => {
    const out = buildRunningEnvironmentContext({
        isSidePanel: true,
        loginStatus: 'Not connected to any Salesforce org.',
        currentApplication: 'agent',
        currentTab: {
            id: 42,
            title: 'Trailhead Quiz',
            url: 'https://trailhead.salesforce.com/quiz',
        },
    });
    assert.match(out, /Chrome Side Panel/);
    assert.match(out, /id: 42/);
    assert.match(out, /Trailhead Quiz/);
    assert.match(out, /listTabs\(\)/);
    assert.match(out, /connectToPage/);
    assert.match(out, /getSnapshot/);
    assert.match(out, /ARIA YAML/);
    assert.match(out, /top-level `await`/);
    assert.match(out, /There are \*\*no\*\* agent tools named `chrome_screenshot`/);
    assert.doesNotMatch(out, /chrome_list_tabs.*work normally/);
    assert.match(out, /Do \*\*not\*\* call `createTab\(\)`/);
});

test('side panel context: still explains how to inspect when tab id is missing', () => {
    const out = buildRunningEnvironmentContext({
        isSidePanel: true,
        loginStatus: 'Not connected to any Salesforce org.',
        currentApplication: null,
        currentTab: null,
    });
    assert.match(out, /listTabs\(\)/);
    assert.match(out, /active/);
    assert.match(out, /There are \*\*no\*\* agent tools named `chrome_screenshot`/);
});

test('web app context: keeps toolkit UI guidance and omits side-panel tab recipe', () => {
    const out = buildRunningEnvironmentContext({
        isSidePanel: false,
        loginStatus: 'Connected org: my-org',
        currentApplication: 'soql',
        currentTab: { id: 1, title: 'Unused', url: 'https://example.com' },
    });
    assert.match(out, /SF Toolkit Web App/);
    assert.match(out, /Currently visible panel: soql/);
    assert.doesNotMatch(out, /listTabs\(\)/);
    assert.doesNotMatch(out, /chrome_screenshot/);
});
