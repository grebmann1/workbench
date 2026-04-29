import assert from 'node:assert/strict';
import { test } from 'node:test';

import { VIEWER_TABS } from '../modules/platformEvent.ts';

test('VIEWER_TABS: expected keys are present', () => {
    assert.equal(VIEWER_TABS.DEFAULT, 'Default');
    assert.equal(VIEWER_TABS.CUSTOM, 'Custom');
    assert.equal(VIEWER_TABS.JSON, 'JSON');
    assert.equal(VIEWER_TABS.SCHEMA, 'Schema');
});

test('VIEWER_TABS: every value is a non-empty string', () => {
    for (const [key, value] of Object.entries(VIEWER_TABS)) {
        assert.equal(typeof value, 'string', `${key} must be a string`);
        assert.ok(value.length > 0, `${key} must not be empty`);
    }
});

test('VIEWER_TABS: values are unique', () => {
    const values = Object.values(VIEWER_TABS);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'VIEWER_TABS values must all be distinct');
});
