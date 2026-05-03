import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveAuthHeaders, type AuthProfile } from '../apiAuthProfiles.ts';

test('resolveAuthHeaders: inherit + token → Bearer', () => {
    const out = resolveAuthHeaders(
        { id: 'inherit', name: 'x', kind: 'inherit', sensitive: false },
        'SESSION'
    );
    assert.deepEqual(out, { Authorization: 'Bearer SESSION' });
});

test('resolveAuthHeaders: inherit without connector token → empty', () => {
    const out = resolveAuthHeaders(
        { id: 'inherit', name: 'x', kind: 'inherit', sensitive: false },
        undefined
    );
    assert.deepEqual(out, {});
});

test('resolveAuthHeaders: bearer uses profile token, ignores connector', () => {
    const profile: AuthProfile = {
        id: 'p1',
        name: 'My Token',
        kind: 'bearer',
        token: 'T',
        sensitive: true,
    };
    assert.deepEqual(resolveAuthHeaders(profile, 'IGNORED'), {
        Authorization: 'Bearer T',
    });
});

test('resolveAuthHeaders: basic → Basic prefix', () => {
    const profile: AuthProfile = {
        id: 'p2',
        name: 'basic',
        kind: 'basic',
        token: 'dXNlcjpwYXNz',
        sensitive: true,
    };
    assert.deepEqual(resolveAuthHeaders(profile, undefined), {
        Authorization: 'Basic dXNlcjpwYXNz',
    });
});

test('resolveAuthHeaders: api_key uses custom header name', () => {
    const profile: AuthProfile = {
        id: 'p3',
        name: 'key',
        kind: 'api_key',
        token: 'K',
        headerName: 'X-API-Key',
        sensitive: true,
    };
    assert.deepEqual(resolveAuthHeaders(profile, undefined), { 'X-API-Key': 'K' });
});

test('resolveAuthHeaders: custom forwards headers map', () => {
    const profile: AuthProfile = {
        id: 'p4',
        name: 'custom',
        kind: 'custom',
        headers: { A: '1', B: '2' },
        sensitive: false,
    };
    assert.deepEqual(resolveAuthHeaders(profile, undefined), { A: '1', B: '2' });
});

test('resolveAuthHeaders: none strips all auth even if connector token exists', () => {
    const profile: AuthProfile = {
        id: 'p5',
        name: 'none',
        kind: 'none',
        sensitive: false,
    };
    assert.deepEqual(resolveAuthHeaders(profile, 'SESSION'), {});
});

test('resolveAuthHeaders: null profile falls back to connector Bearer', () => {
    assert.deepEqual(resolveAuthHeaders(null, 'SESSION'), {
        Authorization: 'Bearer SESSION',
    });
});
