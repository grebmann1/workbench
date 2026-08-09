import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    buildShortcutRows,
    detectIsMac,
    formatShortcut,
    SHORTCUTS,
} from '../shortcutsModal/platform.ts';

test('graphql/shortcutsModal: formatShortcut picks mac label when isMac=true', () => {
    const labels = { mac: '⌘↵', other: 'Ctrl+Enter' };
    assert.equal(formatShortcut(labels, true), '⌘↵');
    assert.equal(formatShortcut(labels, false), 'Ctrl+Enter');
});

test('graphql/shortcutsModal: detectIsMac reads userAgentData.platform and legacy platform', () => {
    assert.equal(detectIsMac({ userAgentData: { platform: 'macOS' } }), true);
    assert.equal(detectIsMac({ platform: 'MacIntel' }), true);
    assert.equal(detectIsMac({ platform: 'Win32' }), false);
    assert.equal(detectIsMac({ platform: 'Linux x86_64' }), false);
    assert.equal(detectIsMac({}), false);
});

test('graphql/shortcutsModal: detectIsMac falls back to global navigator when called with no argument', () => {
    // No override supplied: the function must tolerate a missing argument and
    // fall back to the ambient `navigator` (or an empty object when absent)
    // without throwing.
    assert.doesNotThrow(() => detectIsMac());
    assert.equal(typeof detectIsMac(), 'boolean');
});

test('graphql/shortcutsModal: buildShortcutRows flags disabled rows and formats per-platform', () => {
    const macRows = buildShortcutRows(true);
    const winRows = buildShortcutRows(false);

    // Row count matches the static list.
    assert.equal(macRows.length, SHORTCUTS.length);
    assert.equal(winRows.length, SHORTCUTS.length);

    // Run-query row uses mac glyph on mac, Ctrl+Enter elsewhere.
    const macRun = macRows.find(r => r.id === 'run');
    const winRun = winRows.find(r => r.id === 'run');
    assert.equal(macRun?.shortcut, '⌘↵');
    assert.equal(winRun?.shortcut, 'Ctrl+Enter');

    // The save row is listed but marked disabled.
    const save = macRows.find(r => r.id === 'save');
    assert.equal(save?.disabled, true);
    assert.match(save?.rowClass ?? '', /shortcut-row_disabled/);

    // Non-disabled rows keep the base class only.
    const run = macRows.find(r => r.id === 'run');
    assert.equal(run?.disabled, false);
    assert.equal(run?.rowClass, 'shortcut-row');
});
