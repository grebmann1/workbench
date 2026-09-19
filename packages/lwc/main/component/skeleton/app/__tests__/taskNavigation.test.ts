import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveTaskTarget } from '../taskNavigation';

test('task destinations must be registered and available on the current target', () => {
    const apps = [
        { path: 'soql', name: 'soql/app', label: 'SOQL' },
        { path: 'desktop', name: 'desktop/app', label: 'Desktop', isElectronOnly: true },
        { path: 'smartinput', name: 'smartinput/app', label: 'Smart Input' },
    ];
    const web = { electron: false, chrome: false };
    assert.equal(resolveTaskTarget(apps, 'soql', web), apps[0]);
    assert.equal(resolveTaskTarget(apps, 'https://example.org', web), null);
    assert.equal(resolveTaskTarget(apps, 'desktop', web), null);
    assert.equal(resolveTaskTarget(apps, 'smartinput', web), null);
    assert.equal(resolveTaskTarget(apps, 'smartinput', web, true), apps[2]);
});
