import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildApplicationRedirectUrl } from '../navigation.ts';

test('buildApplicationRedirectUrl: encodes settings application route', () => {
    assert.equal(buildApplicationRedirectUrl('settings'), 'applicationName%3Dsettings');
});

test('buildApplicationRedirectUrl: encodes home application route', () => {
    assert.equal(buildApplicationRedirectUrl('home'), 'applicationName%3Dhome');
});
