import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TEMPLATE } from '../utils.ts';

test('TEMPLATE.BASIC is a string', () => {
    assert.equal(typeof TEMPLATE.BASIC, 'string');
});

test('TEMPLATE.BASIC contains the {0} api version placeholder', () => {
    assert.ok(TEMPLATE.BASIC.includes('{0}'));
});

test('TEMPLATE.BASIC contains the ApexClass metadata type name', () => {
    assert.ok(TEMPLATE.BASIC.includes('<name>ApexClass</name>'));
});

test('TEMPLATE.BASIC is shaped like valid package.xml content', () => {
    assert.match(TEMPLATE.BASIC, /<Package[ >]/);
    assert.match(TEMPLATE.BASIC, /<\/Package>\s*$/);

    const openCount = (TEMPLATE.BASIC.match(/</g) ?? []).length;
    const closeCount = (TEMPLATE.BASIC.match(/>/g) ?? []).length;
    assert.equal(openCount, closeCount);
});
