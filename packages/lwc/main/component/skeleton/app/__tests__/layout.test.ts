import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getShellLayout } from '../layout';

test('responsive collapse does not change the supplied wide-screen preference', () => {
    assert.equal(getShellLayout(1440, false, false).menuCollapsed, false);
    assert.equal(getShellLayout(1024, false, false).menuCollapsed, true);
    assert.equal(getShellLayout(1440, false, false).menuCollapsed, false);
    assert.equal(getShellLayout(1440, false, true).menuCollapsed, true);
});
test('breakpoints and focused surfaces preserve a usable main pane', () => {
    assert.equal(getShellLayout(1199, false, false).compact, true);
    assert.equal(getShellLayout(1200, false, false).compact, false);
    assert.equal(getShellLayout(640, false, false, true).navigationFocused, true);
    assert.equal(getShellLayout(950, false, true).assistantFocused, true);
    assert.equal(getShellLayout(951, false, true).assistantFocused, false);
    assert.equal(getShellLayout(1024, false, true).assistantMaxWidth, 333);
});
