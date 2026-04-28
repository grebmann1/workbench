import { test } from 'node:test';
import assert from 'node:assert/strict';

// platformService (transitive dep) reads window globals; stub before importing.
(globalThis as unknown as { window: Record<string, unknown> }).window = {};

const { getExistingHostMap } = await import('../connectionRegistry.ts');

test('getExistingHostMap: indexes configurations by instanceUrl hostname', () => {
    const configs = [
        { alias: 'a', instanceUrl: 'https://a.my.salesforce.com/' },
        { alias: 'b', instanceUrl: 'https://b.my.salesforce.com/path' },
    ];
    const map = getExistingHostMap(configs);
    assert.equal(map.size, 2);
    assert.equal(map.get('a.my.salesforce.com').alias, 'a');
    assert.equal(map.get('b.my.salesforce.com').alias, 'b');
});

test('getExistingHostMap: falls back to redirectUrl when instanceUrl absent', () => {
    const configs = [{ alias: 'r', redirectUrl: 'https://redirect.example/callback' }];
    const map = getExistingHostMap(configs);
    assert.equal(map.get('redirect.example').alias, 'r');
});

test('getExistingHostMap: skips entries with neither URL set', () => {
    const configs = [{ alias: 'x' }, { alias: 'y', instanceUrl: 'https://y.my.salesforce.com' }];
    const map = getExistingHostMap(configs);
    assert.equal(map.size, 1);
    assert.ok(!map.has('unknown'));
});

test('getExistingHostMap: later duplicates overwrite earlier', () => {
    const first = { alias: 'first', instanceUrl: 'https://shared.my.salesforce.com' };
    const second = { alias: 'second', instanceUrl: 'https://shared.my.salesforce.com' };
    const map = getExistingHostMap([first, second]);
    assert.equal(map.size, 1);
    assert.equal(map.get('shared.my.salesforce.com').alias, 'second');
});

// getMatchingConfiguration is not covered directly — it calls through to
// platformService.getConfigurations() which pulls IndexedDB via cacheManager.
// getExistingHostMap (above) is the pure building block and the target for
// regression protection; the full path is exercised end-to-end in
// Playwright smokes.
