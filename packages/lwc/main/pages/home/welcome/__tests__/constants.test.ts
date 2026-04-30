import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GITHUB_DISCUSSIONS_URL, AI_DOC_URL, QUICK_TIPS } from '../constants.js';

test('GITHUB_DISCUSSIONS_URL: absolute https URL pointing at the project repo', () => {
    assert.equal(typeof GITHUB_DISCUSSIONS_URL, 'string');
    assert.match(GITHUB_DISCUSSIONS_URL, /^https:\/\/github\.com\//);
    assert.ok(GITHUB_DISCUSSIONS_URL.includes('/discussions'));
});

test('AI_DOC_URL: relative docs path (not absolute)', () => {
    assert.equal(typeof AI_DOC_URL, 'string');
    assert.ok(AI_DOC_URL.length > 0);
    assert.ok(!AI_DOC_URL.startsWith('http'));
});

test('QUICK_TIPS: is a non-empty array with required fields on every tip', () => {
    assert.ok(Array.isArray(QUICK_TIPS));
    assert.ok(QUICK_TIPS.length > 0);
    for (const tip of QUICK_TIPS) {
        assert.equal(typeof tip.id, 'string');
        assert.ok(tip.id.length > 0, `${tip.title} missing id`);
        assert.match(tip.icon, /^utility:/, `${tip.id} icon must use utility namespace`);
        assert.ok(tip.title.length > 0, `${tip.id} missing title`);
        assert.ok(tip.message.length > 0, `${tip.id} missing message`);
    }
});

test('QUICK_TIPS: ids are unique', () => {
    const ids = QUICK_TIPS.map(t => t.id);
    assert.equal(ids.length, new Set(ids).size);
});
