import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LUCIDE_ICONS, LUCIDE_ICON_NAMES } from '../constants.ts';

test('LUCIDE_ICONS: contains a large generated icon set', () => {
    assert.ok(
        LUCIDE_ICON_NAMES.length > 500,
        `expected > 500 icons, got ${LUCIDE_ICON_NAMES.length}`
    );
});

test('LUCIDE_ICONS: every entry is a non-empty array of svg elements', () => {
    const allowedTags = new Set([
        'path',
        'circle',
        'rect',
        'line',
        'polyline',
        'polygon',
        'ellipse',
    ]);
    let sampled = 0;
    for (const [name, shapes] of Object.entries(LUCIDE_ICONS)) {
        assert.ok(Array.isArray(shapes), `${name} must be an array`);
        assert.ok(shapes.length > 0, `${name} must have shapes`);
        for (const shape of shapes) {
            assert.equal(typeof shape.key, 'string', `${name} shape key`);
            assert.ok(shape.key.length > 0, `${name} shape key non-empty`);
            assert.ok(allowedTags.has(shape.tag), `${name} unexpected tag: ${shape.tag}`);
        }
        // Avoid iterating 16k+ entries at full depth — sample check.
        if (++sampled > 200) break;
    }
});

test('LUCIDE_ICONS: shape keys within an icon are unique', () => {
    let sampled = 0;
    for (const [name, shapes] of Object.entries(LUCIDE_ICONS)) {
        const keys = shapes.map(s => s.key);
        assert.equal(
            keys.length,
            new Set(keys).size,
            `${name} has duplicate shape keys: ${keys.join(',')}`
        );
        if (++sampled > 300) break;
    }
});

test('LUCIDE_ICON_NAMES: matches Object.keys(LUCIDE_ICONS)', () => {
    assert.equal(LUCIDE_ICON_NAMES.length, Object.keys(LUCIDE_ICONS).length);
    // Deterministic: names are unique.
    assert.equal(LUCIDE_ICON_NAMES.length, new Set(LUCIDE_ICON_NAMES).size);
});

test('LUCIDE_ICONS: includes a couple of known everyday icons', () => {
    for (const expected of ['activity', 'accessibility', 'zoom-out']) {
        assert.ok(expected in LUCIDE_ICONS, `expected known icon '${expected}' to be present`);
    }
});

test('LUCIDE_ICONS: icon names use kebab-case (no spaces, no uppercase)', () => {
    let sampled = 0;
    for (const name of LUCIDE_ICON_NAMES) {
        assert.ok(!/\s/.test(name), `${name} contains whitespace`);
        assert.equal(name, name.toLowerCase(), `${name} has uppercase`);
        if (++sampled > 500) break;
    }
});
