import assert from 'node:assert/strict';
import { test } from 'node:test';

// @ts-expect-error - .mjs module without types
import { __scrubSensitiveForTests as scrubSensitive } from '../reporters/jsonlReporter.mjs';

test('scrubSensitive: redacts authorization header values', () => {
    const input = {
        type: 'start-step',
        request: {
            headers: { authorization: 'Bearer sk-abcdefghij' },
        },
    };
    const out = scrubSensitive(input);
    const json = JSON.stringify(out);
    assert.ok(json.includes('***REDACTED***'), 'expected redaction marker');
    assert.ok(!json.includes('sk-abcdefghij'), 'raw token must not leak');
    assert.ok(!json.includes('Bearer sk-abcdefghij'), 'bearer value must be scrubbed');
});

test('scrubSensitive: redacts api_key query-string values and preserves other params', () => {
    const input = {
        url: 'https://example.com/v1?api_key=SECRETVALUE&x=1',
    };
    const out = scrubSensitive(input);
    assert.equal(out.url, 'https://example.com/v1?api_key=***REDACTED***&x=1');
    assert.ok(out.url.includes('x=1'), 'unrelated param preserved');
    assert.ok(!out.url.includes('SECRETVALUE'), 'api key value must be scrubbed');
});

test('scrubSensitive: redacts access_token and accessToken query params too', () => {
    const a = scrubSensitive({ url: 'https://x/y?access_token=ABCDEFG&z=2' });
    assert.equal(a.url, 'https://x/y?access_token=***REDACTED***&z=2');

    const b = scrubSensitive({ url: 'https://x/y?accessToken=ABCDEFG&z=2' });
    assert.equal(b.url, 'https://x/y?accessToken=***REDACTED***&z=2');

    const c = scrubSensitive({ url: 'https://x/y?key=ABCDEFG&z=2' });
    assert.equal(c.url, 'https://x/y?key=***REDACTED***&z=2');
});

test('scrubSensitive: redacts loose sk- tokens embedded in strings', () => {
    const input = {
        text: 'here is a leaked key sk-TESTKEY1234567890 in the body',
    };
    const out = scrubSensitive(input);
    assert.ok(!out.text.includes('sk-TESTKEY1234567890'), 'token must be removed');
    assert.ok(out.text.includes('***REDACTED***'), 'redaction marker expected');
});

test('scrubSensitive: clean chunk round-trips unchanged', () => {
    const input = {
        type: 'text-delta',
        payload: { delta: 'Hello, world!', chunkIndex: 3, elapsedMs: 42 },
        meta: { nested: { foo: 'bar', arr: [1, 2, 3] } },
    };
    const out = scrubSensitive(input);
    assert.deepEqual(out, input, 'clean value must be idempotent');
});

test('scrubSensitive: uppercase Authorization key is matched case-insensitively', () => {
    const input = {
        headers: { Authorization: 'Bearer someopaquetoken' },
    };
    const json = JSON.stringify(scrubSensitive(input));
    assert.ok(json.includes('***REDACTED***'));
    assert.ok(!json.includes('someopaquetoken'));
});
