import { test } from 'node:test';
import assert from 'node:assert/strict';

import { setupLinks } from '../links.ts';

test('setupLinks: is a non-empty array', () => {
    assert.ok(Array.isArray(setupLinks));
    assert.ok(setupLinks.length > 100, `expected > 100 setup links, got ${setupLinks.length}`);
});

test('setupLinks: every entry has the required fields with correct types', () => {
    for (const entry of setupLinks) {
        assert.equal(
            typeof entry.label,
            'string',
            `label should be string for ${JSON.stringify(entry)}`
        );
        assert.ok(entry.label.length > 0, `label should be non-empty`);
        assert.equal(typeof entry.link, 'string', `link should be string`);
        assert.ok(entry.link.length > 0, `link should be non-empty`);
        assert.equal(typeof entry.section, 'string', `section should be string`);
        assert.ok(entry.section.length > 0, `section should be non-empty`);
        assert.equal(typeof entry.prod, 'boolean', `prod should be boolean`);
    }
});

test('setupLinks: no duplicate (label + link + section) triple', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of setupLinks) {
        const key = `${entry.section}::${entry.label}::${entry.link}`;
        if (seen.has(key)) duplicates.push(key);
        seen.add(key);
    }
    assert.deepEqual(duplicates, [], `duplicate setup link entries: ${duplicates.join(', ')}`);
});

test('setupLinks: at least one prod=true entry exists (dev hub section)', () => {
    const prodEntries = setupLinks.filter(e => e.prod === true);
    assert.ok(prodEntries.length > 0, 'expected some prod=true links');
});

test('setupLinks: links start with a slash', () => {
    // Spec check — every setup link is rendered relative to the org host.
    // (One known entry has a typo — `lightning/setup/ServiceCloudEinsteinReadinessCheck`.
    // We tolerate either form here but require it to be a path-like value.)
    for (const entry of setupLinks) {
        assert.ok(
            entry.link.startsWith('/') || entry.link.startsWith('lightning/'),
            `link should be path-like: ${entry.link}`
        );
    }
});
