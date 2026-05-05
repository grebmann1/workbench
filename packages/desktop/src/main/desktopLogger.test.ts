import assert from 'node:assert/strict';
import test from 'node:test';

import { redactSecrets } from './desktopLogger';

test('redactSecrets removes Salesforce token material from log strings', () => {
    const redacted = redactSecrets(
        'Bearer abc.def refreshToken=refresh-token sessionId: 00Dxx accessToken "abc" force://client::refresh-token@example.my.salesforce.com'
    );

    assert.equal(redacted.includes('refresh-token'), false);
    assert.equal(redacted.includes('abc.def'), false);
    assert.equal(redacted.includes('00Dxx'), false);
    assert.match(redacted, /<redacted>/);
});
