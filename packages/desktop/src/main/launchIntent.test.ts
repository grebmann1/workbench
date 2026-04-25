import assert from 'node:assert/strict';
import test from 'node:test';

import {
    createDefaultLaunchIntent,
    normalizeDesktopCommand,
    parseLaunchIntent,
    serializeLaunchIntent,
} from './launchIntent';

test('parseLaunchIntent returns the default app intent when none is provided', () => {
    assert.deepEqual(parseLaunchIntent(['electron', '.']), createDefaultLaunchIntent());
});

test('parseLaunchIntent restores a serialized org intent', () => {
    const serializedIntent = serializeLaunchIntent({
        target: 'org',
        orgAlias: 'demo-org',
    });

    assert.deepEqual(parseLaunchIntent(['electron', '.', serializedIntent]), {
        target: 'org',
        orgAlias: 'demo-org',
    });
});

test('parseLaunchIntent falls back to the default app intent for invalid payloads', () => {
    assert.deepEqual(
        parseLaunchIntent(['electron', '.', '--desktop-intent=not-a-valid-payload']),
        createDefaultLaunchIntent()
    );
});

test('parseLaunchIntent restores a serialized v2 open page command', () => {
    const serializedIntent = serializeLaunchIntent({
        v: 2,
        type: 'openPage',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
        route: {
            applicationName: 'soql',
            state: {
                query: 'SELECT Id FROM Account LIMIT 10',
            },
        },
    });

    assert.deepEqual(parseLaunchIntent(['electron', '.', serializedIntent]), {
        v: 2,
        type: 'openPage',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
        route: {
            applicationName: 'soql',
            state: {
                query: 'SELECT Id FROM Account LIMIT 10',
            },
        },
    });
});

test('normalizeDesktopCommand converts legacy app and org intents to v2 commands', () => {
    assert.deepEqual(normalizeDesktopCommand({ target: 'app' }), { v: 2, type: 'openApp' });
    assert.deepEqual(normalizeDesktopCommand({ target: 'org', orgAlias: 'demo-org' }), {
        v: 2,
        type: 'openOrg',
        org: {
            kind: 'alias',
            alias: 'demo-org',
        },
    });
});
