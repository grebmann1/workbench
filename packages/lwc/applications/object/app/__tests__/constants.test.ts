import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCategoryIcon } from '../constants.ts';

test('getCategoryIcon: known categories map to lucide icons', () => {
    assert.equal(getCategoryIcon('change', false), 'lucide:activity');
    assert.equal(getCategoryIcon('event', false), 'lucide:radio');
    assert.equal(getCategoryIcon('metadata', false), 'lucide:table');
    assert.equal(getCategoryIcon('feed', false), 'lucide:rss');
    assert.equal(getCategoryIcon('history', false), 'lucide:clock');
    assert.equal(getCategoryIcon('share', false), 'lucide:share-2');
});

test('getCategoryIcon: unknown falls back to database for standard/custom', () => {
    assert.equal(getCategoryIcon('nope', false), 'lucide:database');
    assert.equal(getCategoryIcon('nope', true), 'lucide:database');
});
