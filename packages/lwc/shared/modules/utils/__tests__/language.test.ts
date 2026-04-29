import { test } from 'node:test';
import assert from 'node:assert/strict';

import { getLanguage, formatFiles } from '../language.ts';

test('getLanguage: maps known extensions to Monaco language ids', () => {
    assert.equal(getLanguage('js'), 'javascript');
    assert.equal(getLanguage('ts'), 'typescript');
    assert.equal(getLanguage('apex'), 'apex');
    assert.equal(getLanguage('cls'), 'apex');
    assert.equal(getLanguage('trigger'), 'apex');
    assert.equal(getLanguage('page'), 'html');
    assert.equal(getLanguage('svg'), 'xml');
});

test('getLanguage: unknown extension returns null', () => {
    assert.equal(getLanguage('gif'), null);
    assert.equal(getLanguage(''), null);
});

test('getLanguage: null/undefined extension returns null', () => {
    assert.equal(getLanguage(null), null);
    assert.equal(getLanguage(undefined), null);
});

test('formatFiles: attaches extension + language and falls back for unknowns', () => {
    const out = formatFiles(
        [{ name: 'main.ts' }, { name: 'README' }, { name: 'style.unknown' }],
        'plaintext'
    );
    assert.deepEqual(out[0].extension, 'ts');
    assert.equal(out[0].language, 'typescript');

    // No extension → null extension, fallback language.
    assert.equal(out[1].extension, null);
    assert.equal(out[1].language, 'plaintext');

    // Unknown extension → keeps extension, but falls back on language.
    assert.equal(out[2].extension, 'unknown');
    assert.equal(out[2].language, 'plaintext');
});

test('formatFiles: preserves extra fields from the source objects', () => {
    const files = [{ name: 'a.ts', size: 42 }];
    const out = formatFiles(files, 'plaintext');
    assert.equal(out[0].size, 42);
});
