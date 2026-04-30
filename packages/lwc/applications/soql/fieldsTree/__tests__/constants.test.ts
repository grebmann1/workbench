import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getFieldTypeIcon } from '../constants.ts';

test('fieldsTree/constants: known types', () => {
    assert.equal(getFieldTypeIcon('int'), 'lucide:hash');
    assert.equal(getFieldTypeIcon('address'), 'lucide:map-pin');
    assert.equal(getFieldTypeIcon('multipicklist'), 'lucide:list-checks');
});

test('fieldsTree/constants: default fallback + null/empty', () => {
    assert.equal(getFieldTypeIcon(''), 'lucide:type');
    assert.equal(getFieldTypeIcon(null as any), 'lucide:type');
    assert.equal(getFieldTypeIcon('xyz'), 'lucide:type');
});
