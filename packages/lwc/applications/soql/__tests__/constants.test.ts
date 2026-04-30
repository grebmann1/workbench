import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getFieldTypeIcon, SOBJECT_ICON, CHILD_RELATIONSHIP_ICON } from '../constants.ts';

test('soql/constants: SOBJECT_ICON and CHILD_RELATIONSHIP_ICON', () => {
    assert.equal(SOBJECT_ICON, 'lucide:database');
    assert.equal(CHILD_RELATIONSHIP_ICON, 'lucide:git-branch');
});

test('soql/constants: getFieldTypeIcon known + fallback', () => {
    assert.equal(getFieldTypeIcon('datetime'), 'lucide:calendar-clock');
    assert.equal(getFieldTypeIcon('unknown'), 'lucide:type');
});
