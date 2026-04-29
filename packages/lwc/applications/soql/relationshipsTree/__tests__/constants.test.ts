import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getFieldTypeIcon, CHILD_RELATIONSHIP_ICON } from '../constants.ts';

test('constants: CHILD_RELATIONSHIP_ICON is git-branch', () => {
    assert.equal(CHILD_RELATIONSHIP_ICON, 'lucide:git-branch');
});

test('getFieldTypeIcon: case-insensitive lookup + default fallback', () => {
    assert.equal(getFieldTypeIcon('reference'), 'lucide:link');
    assert.equal(getFieldTypeIcon('REFERENCE'), 'lucide:link');
    assert.equal(getFieldTypeIcon('unknown'), 'lucide:type');
    assert.equal(getFieldTypeIcon(''), 'lucide:type');
});

test('getFieldTypeIcon: handles null/undefined without throwing', () => {
    assert.equal(getFieldTypeIcon(null as any), 'lucide:type');
    assert.equal(getFieldTypeIcon(undefined as any), 'lucide:type');
});
