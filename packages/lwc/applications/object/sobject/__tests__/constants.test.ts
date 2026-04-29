import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getFieldTypeIcon, API_COLORS } from '../constants.ts';

test('getFieldTypeIcon: known types map to lucide icon', () => {
    assert.equal(getFieldTypeIcon('id'), 'lucide:hash');
    assert.equal(getFieldTypeIcon('string'), 'lucide:type');
    assert.equal(getFieldTypeIcon('boolean'), 'lucide:toggle-left');
    assert.equal(getFieldTypeIcon('currency'), 'lucide:circle-dollar-sign');
    assert.equal(getFieldTypeIcon('reference'), 'lucide:link');
});

test('getFieldTypeIcon: lowercases input', () => {
    assert.equal(getFieldTypeIcon('DateTime'), 'lucide:calendar-clock');
    assert.equal(getFieldTypeIcon('PICKLIST'), 'lucide:chevrons-up-down');
});

test('getFieldTypeIcon: unknown/empty falls back to default "type"', () => {
    assert.equal(getFieldTypeIcon('mystery'), 'lucide:type');
    assert.equal(getFieldTypeIcon(''), 'lucide:type');
    assert.equal(getFieldTypeIcon(null as any), 'lucide:type');
    assert.equal(getFieldTypeIcon(undefined as any), 'lucide:type');
});

test('API_COLORS: includes expected keys with badge-* values', () => {
    for (const key of [
        'queryable',
        'searchable',
        'createable',
        'updateable',
        'deletable',
        'layoutable',
        'retrieveable',
    ]) {
        assert.ok(API_COLORS[key], `missing ${key}`);
        assert.match(API_COLORS[key], /^badge-/);
    }
});
