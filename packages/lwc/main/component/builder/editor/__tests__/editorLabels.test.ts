import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LABELS } from '../editorLabels.ts';

test('editorLabels.LABELS: expected keys present with non-empty string values', () => {
    assert.equal(typeof LABELS, 'object');
    assert.ok(LABELS !== null);

    const expectedKeys = ['spinnerAlternativeText', 'readOnlyModeAlertMessage'] as const;
    for (const key of expectedKeys) {
        const value = (LABELS as Record<string, unknown>)[key];
        assert.equal(typeof value, 'string', `LABELS.${key} must be a string`);
        assert.ok((value as string).length > 0, `LABELS.${key} must not be empty`);
    }
});

test('editorLabels.LABELS: no label value is undefined or null', () => {
    for (const [key, value] of Object.entries(LABELS)) {
        assert.notEqual(value, undefined, `LABELS.${key} is undefined`);
        assert.notEqual(value, null, `LABELS.${key} is null`);
    }
});
