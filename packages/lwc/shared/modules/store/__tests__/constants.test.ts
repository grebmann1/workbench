import assert from 'node:assert/strict';
import { test } from 'node:test';

import * as constants from '../constants.ts';

test('store/constants: every export matches the SCREAMING_SNAKE action-type shape', () => {
    const values = Object.values(constants);
    assert.ok(values.length > 0, 'expected at least one exported constant');
    for (const [name, value] of Object.entries(constants)) {
        assert.equal(typeof value, 'string', `${name} must be a string`);
        assert.match(
            value,
            /^[A-Z][A-Z0-9_/]+$/,
            `${name}'s value (${value}) must match SCREAMING_SNAKE action-type shape`
        );
    }
});

test('store/constants: every exported value is unique', () => {
    const values = Object.values(constants);
    const unique = new Set(values);
    assert.equal(values.length, unique.size, 'action-type constants must not alias each other');
});

test('store/constants: key and value match by convention (except for the /index re-export if any)', () => {
    for (const [name, value] of Object.entries(constants)) {
        // Every action type in this module is exported with a name equal
        // to its string value — this is the authoring contract that
        // protects refactors from silently decoupling the two.
        assert.equal(value, name, `constant ${name} diverged from its value ${value}`);
    }
});
