import assert from 'node:assert/strict';
import { test } from 'node:test';

import { APPLICATIONS, normalizeApplicationName } from '../applicationState.js';

test('APPLICATIONS: exposes exactly the expected keys/values', () => {
    assert.deepEqual(APPLICATIONS, {
        CONNECTION: 'connection',
        DOCUMENTATION: 'documentation',
        ASSISTANT: 'assistant',
        AGENT: 'agent',
        SMARTINPUT: 'smartinput',
    });
});

test('normalizeApplicationName: valid app name is returned unchanged', () => {
    assert.equal(normalizeApplicationName(APPLICATIONS.AGENT), APPLICATIONS.AGENT);
    assert.equal(normalizeApplicationName(APPLICATIONS.DOCUMENTATION), APPLICATIONS.DOCUMENTATION);
    assert.equal(normalizeApplicationName(APPLICATIONS.ASSISTANT), APPLICATIONS.ASSISTANT);
});

test('normalizeApplicationName: "home" maps to CONNECTION', () => {
    assert.equal(normalizeApplicationName('home'), APPLICATIONS.CONNECTION);
});

test('normalizeApplicationName: unknown/invalid name falls back to CONNECTION', () => {
    assert.equal(normalizeApplicationName('unknown-app'), APPLICATIONS.CONNECTION);
});

test('normalizeApplicationName: non-string, empty, or whitespace-only input falls back to CONNECTION', () => {
    assert.equal(normalizeApplicationName(null), APPLICATIONS.CONNECTION);
    assert.equal(normalizeApplicationName(undefined), APPLICATIONS.CONNECTION);
    assert.equal(normalizeApplicationName(42), APPLICATIONS.CONNECTION);
    assert.equal(normalizeApplicationName(''), APPLICATIONS.CONNECTION);
    assert.equal(normalizeApplicationName('   '), APPLICATIONS.CONNECTION);
});

test('normalizeApplicationName: SMARTINPUT without beta flag falls back to CONNECTION', () => {
    assert.equal(normalizeApplicationName(APPLICATIONS.SMARTINPUT, false), APPLICATIONS.CONNECTION);
    assert.equal(normalizeApplicationName(APPLICATIONS.SMARTINPUT), APPLICATIONS.CONNECTION);
});

test('normalizeApplicationName: SMARTINPUT with beta flag enabled stays SMARTINPUT', () => {
    assert.equal(normalizeApplicationName(APPLICATIONS.SMARTINPUT, true), APPLICATIONS.SMARTINPUT);
});
