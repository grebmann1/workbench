import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    MODAL_VARIANTS,
    DEFAULT_TITLE,
    DEFAULT_SUBTITLE,
    EXPIRED_TITLE,
    EXPIRED_SUBTITLE,
    MODAL_COPY,
} from '../constants.js';

test('MODAL_VARIANTS: declares expired / missing-session / reconnect-failed keys', () => {
    assert.equal(MODAL_VARIANTS.EXPIRED, 'expired');
    assert.equal(MODAL_VARIANTS.MISSING_SESSION, 'missing-session');
    assert.equal(MODAL_VARIANTS.RECONNECT_FAILED, 'reconnect-failed');
    const values = Object.values(MODAL_VARIANTS);
    assert.equal(values.length, new Set(values).size);
});

test('DEFAULT_TITLE / DEFAULT_SUBTITLE / EXPIRED_TITLE / EXPIRED_SUBTITLE: non-empty strings', () => {
    for (const [name, value] of [
        ['DEFAULT_TITLE', DEFAULT_TITLE],
        ['DEFAULT_SUBTITLE', DEFAULT_SUBTITLE],
        ['EXPIRED_TITLE', EXPIRED_TITLE],
        ['EXPIRED_SUBTITLE', EXPIRED_SUBTITLE],
    ]) {
        assert.equal(typeof value, 'string', name);
        assert.ok(value.length > 0, `${name} non-empty`);
    }
});

test('MODAL_COPY: has one entry per MODAL_VARIANT with heading/message/details strings', () => {
    for (const variant of Object.values(MODAL_VARIANTS)) {
        const copy = MODAL_COPY[variant];
        assert.ok(copy, `${variant} missing copy`);
        assert.ok(copy.heading.length > 0);
        assert.ok(copy.message.length > 0);
        assert.ok(copy.details.length > 0);
    }
    assert.equal(Object.keys(MODAL_COPY).length, Object.values(MODAL_VARIANTS).length);
});
