import { test } from 'node:test';
import assert from 'node:assert/strict';

import { theme } from '../theme.ts';

test('theme: exposes the expected top-level token groups', () => {
    assert.ok(theme.colors);
    assert.ok(theme.fontSizes);
    assert.ok(theme.fontWeights);
    assert.ok(theme.fonts);
    assert.ok(theme.space);
    assert.ok(theme.radii);
    assert.ok(theme.shadows);
    assert.ok(theme.transitions);
    assert.ok(theme.zIndices);
});

test('theme: core accent colors are defined', () => {
    assert.equal(typeof theme.colors['accent-primary-base'], 'string');
    assert.equal(typeof theme.colors['accent-secondary-base'], 'string');
    assert.match(theme.colors['accent-primary-base'], /^#/);
});

test('theme: zIndices are ordered so commandPalette sits above base menu', () => {
    assert.ok(Number(theme.zIndices.base) < Number(theme.zIndices.menu));
    assert.ok(Number(theme.zIndices.menu) < Number(theme.zIndices.commandPalette));
    assert.ok(Number(theme.zIndices.commandPalette) < Number(theme.zIndices.top));
});

test('theme: space + sizes share the same step scale from 0 to 25', () => {
    for (let i = 0; i <= 25; i++) {
        assert.equal(theme.space[i], theme.sizes[i]);
    }
});

test('theme: font stacks include sensible fallbacks', () => {
    assert.ok(theme.fonts.base.includes('Inter'));
    assert.ok(theme.fonts.mono.includes('monospace'));
});
