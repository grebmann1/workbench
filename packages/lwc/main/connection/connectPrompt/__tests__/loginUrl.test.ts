import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveLoginUrl } from '../loginUrl';

test('each environment resolves to the intended Salesforce origin', () => {
    assert.equal(resolveLoginUrl('production', ''), 'https://login.salesforce.com');
    assert.equal(resolveLoginUrl('sandbox', ''), 'https://test.salesforce.com');
    assert.equal(
        resolveLoginUrl('custom', ' https://my-org.my.salesforce.com/ '),
        'https://my-org.my.salesforce.com'
    );
});
test('invalid domains, insecure URLs, and non-origin input are rejected', () => {
    for (const domain of [
        '',
        'http://my.salesforce.com',
        'https://salesforce.com.example.org',
        'https://x.salesforce.com/path',
        'https://user@x.salesforce.com',
        'https://x.salesforce.com?q=a',
    ]) {
        assert.throws(() => resolveLoginUrl('custom', domain), /My Domain/);
    }
});
