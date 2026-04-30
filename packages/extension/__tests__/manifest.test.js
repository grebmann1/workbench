import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const manifest = JSON.parse(fs.readFileSync('packages/extension/manifest.template.json', 'utf8'));

test('manifest lists debugger as a required permission', () => {
    assert.ok(manifest.permissions.includes('debugger'));
    assert.equal(manifest.optional_permissions?.includes('debugger') === true, false);
});

// The following assertions lock the contract behind the pin-and-click UX:
// Chrome shows a toolbar icon only when `action` is set; clicking it wakes
// the service worker, which calls chrome.sidePanel.open(). Drop any of
// these and the pinned-icon-opens-side-panel flow silently breaks.

test('manifest requests sidePanel permission', () => {
    assert.ok(manifest.permissions.includes('sidePanel'));
});

test('manifest declares an action entry with a tooltip', () => {
    assert.ok(manifest.action, 'manifest.action must be present so Chrome renders a toolbar icon');
    assert.equal(typeof manifest.action.default_title, 'string');
    assert.ok(manifest.action.default_title.length > 0);
});

test('manifest binds open_side_panel to Ctrl+Shift+Space', () => {
    const cmd = manifest.commands?.open_side_panel;
    assert.ok(cmd, 'commands.open_side_panel must exist as the keyboard fallback');
    assert.equal(cmd.suggested_key?.default, 'Ctrl+Shift+Space');
});

test('manifest wires the background service worker as an ES module', () => {
    assert.equal(manifest.background?.service_worker, 'scripts/background.js');
    assert.equal(manifest.background?.type, 'module');
});
