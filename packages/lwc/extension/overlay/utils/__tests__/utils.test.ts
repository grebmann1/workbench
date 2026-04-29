import assert from 'node:assert/strict';
import { test } from 'node:test';

import { TYPE } from '../utils.ts';

test('TYPE: contains expected Salesforce entity labels', () => {
    assert.equal(TYPE.ALL, 'All');
    assert.equal(TYPE.APEX_CLASS, 'Apex Class');
    assert.equal(TYPE.APEX_TRIGGER, 'Apex Trigger');
    assert.equal(TYPE.LWC, 'LWC');
    assert.equal(TYPE.AURA, 'Aura');
    assert.equal(TYPE.FLOW, 'Flow');
    assert.equal(TYPE.USER, 'User');
    assert.equal(TYPE.OBJECT, 'Object');
    assert.equal(TYPE.PROFILE, 'Profile');
    assert.equal(TYPE.PERMISSION_SET, 'Permission Set');
    assert.equal(TYPE.CUSTOM, 'Custom');
});

test('TYPE: keys are stable (guard against typos)', () => {
    const expected = [
        'ALL',
        'APEX_TRIGGER',
        'APEX_CLASS',
        'AURA',
        'LINK',
        'DEV_LINK',
        'LWC',
        'OBJECT',
        'PROFILE',
        'PERMISSION_SET',
        'USER',
        'FLOW',
        'AGENTFORCE',
        'CUSTOM',
    ];
    assert.deepEqual(Object.keys(TYPE).sort(), [...expected].sort());
});
