/**
 * Tests for the pure empty-state content lookup. The visual logic of the
 * `<agentforce-empty-state>` LWC component lives in this helper, so we can
 * cover all 4 kinds × 3 variants without an LWC test harness.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    deriveVariantFromError,
    getEmptyStateContent,
    type EmptyStateKind,
    type EmptyStateVariant,
} from '../emptyStates.ts';

test('inspector + no-data → "No agents in this org"', () => {
    const c = getEmptyStateContent('inspector', 'no-data');
    assert.equal(c.title, 'No agents in this org');
    assert.match(c.message, /Agent Builder/);
    assert.equal(c.iconName, 'standard:bot');
});

test('debugger + error with custom message → uses the classified message verbatim', () => {
    const c = getEmptyStateContent('debugger', 'error', 'Network timeout while fetching steps.');
    assert.equal(c.title, "Couldn't load conversations");
    assert.equal(c.message, 'Network timeout while fetching steps.');
    assert.ok(c.iconName.startsWith('standard:'));
});

test('debugger + error without custom message → falls back to canned copy', () => {
    const c = getEmptyStateContent('debugger', 'error');
    assert.equal(c.title, "Couldn't load conversations");
    assert.match(c.message, /fetching interactions/);
});

test('inspector + permission-denied → permissions guidance, lock icon', () => {
    const c = getEmptyStateContent('inspector', 'permission-denied');
    assert.equal(c.title, 'Insufficient permissions');
    assert.match(c.message, /BotDefinition/);
    assert.equal(c.iconName, 'standard:lock');
});

test('every (kind, variant) pair returns a non-empty title/message/icon', () => {
    const kinds: EmptyStateKind[] = ['inspector', 'debugger', 'dependencies', 'editor'];
    const variants: EmptyStateVariant[] = [
        'no-data',
        'permission-denied',
        'feature-unavailable',
        'error',
    ];
    for (const kind of kinds) {
        for (const variant of variants) {
            const c = getEmptyStateContent(kind, variant);
            assert.ok(c.title.length > 0, `${kind}/${variant}: empty title`);
            assert.ok(c.message.length > 0, `${kind}/${variant}: empty message`);
            assert.ok(c.iconName.startsWith('standard:'), `${kind}/${variant}: bad icon`);
        }
    }
});

test('deriveVariantFromError: null/empty → null (no error)', () => {
    assert.equal(deriveVariantFromError(null), null);
    assert.equal(deriveVariantFromError(undefined), null);
    assert.equal(deriveVariantFromError(''), null);
});

test('deriveVariantFromError: classified "Permission denied" prefix → permission-denied', () => {
    assert.equal(
        deriveVariantFromError(
            'Permission denied — your user lacks access to this entity or field.'
        ),
        'permission-denied'
    );
});

test('deriveVariantFromError: arbitrary message → error', () => {
    assert.equal(
        deriveVariantFromError('Salesforce service error (HTTP 503). Please retry shortly.'),
        'error'
    );
    assert.equal(deriveVariantFromError('Unknown error'), 'error');
});

test('deriveVariantFromError: org without Agentforce → feature-unavailable', () => {
    assert.equal(
        deriveVariantFromError('INVALID_TYPE: Cannot use: AiAuthoringBundle in this organization'),
        'feature-unavailable'
    );
    assert.equal(
        deriveVariantFromError("sObject type 'GenAiPlanner' is not supported."),
        'feature-unavailable'
    );
});

test('feature-unavailable copy is friendly and never echoes the raw error', () => {
    const c = getEmptyStateContent(
        'inspector',
        'feature-unavailable',
        'INVALID_TYPE: Cannot use: AiAuthoringBundle in this organization'
    );
    assert.equal(c.title, "Agentforce isn't enabled here");
    assert.match(c.message, /Agentforce/);
    assert.doesNotMatch(c.message, /INVALID_TYPE|AiAuthoringBundle/);
    assert.equal(c.iconName, 'standard:einstein');
});

test('getEmptyStateContent: whitespace-only errorMessage → fall back to canned copy', () => {
    const c = getEmptyStateContent('editor', 'error', '   ');
    assert.match(c.message, /AgentScript/);
});
