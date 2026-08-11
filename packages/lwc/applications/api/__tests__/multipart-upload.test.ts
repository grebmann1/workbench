import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const template = readFileSync(new URL('../app/app.html', import.meta.url), 'utf8');

test('body type controls support raw, form-data, and binary requests', () => {
    assert.match(template, /label="Body type"/);
    assert.match(template, /label="Add part"/);
    assert.match(template, /label="Binary file"/);
});

test('file body modes persist their type without persisting file objects', () => {
    const component = readFileSync(new URL('../app/app.ts', import.meta.url), 'utf8');
    assert.match(component, /bodyMode: this\.bodyMode/);
    assert.match(component, /isConnectedOrgUrl\(_formattedRequest\.url\)/);
    assert.match(component, /executedRequest\.bodyMode === 'form-data'/);
    assert.match(component, /clearFormDataFiles\(this\.currentTab\.id\)/);
    assert.match(component, /clearBinaryFile\(this\.currentTab\.id\)/);
    assert.match(component, /bodyMode: extra\?\.bodyMode \?\? 'raw'/);
    assert.match(component, /clearFormDataFiles\(this\.currentTab\?\.id\)/);
});

test('form-data supports multiple independent parts', () => {
    assert.match(template, /for:each={formDataParts}/);
    assert.match(template, /alternative-text="Remove part"/);
});

test('no-body mode retains an explicit null execution body', () => {
    const slice = readFileSync(new URL('../slices/api.ts', import.meta.url), 'utf8');
    assert.match(slice, /executionBody !== undefined \? executionBody : formattedRequest\?\.body/);
});

test('bodyless requests do not use the file-body validation sentinel', () => {
    const component = readFileSync(new URL('../app/app.ts', import.meta.url), 'utf8');
    assert.match(component, /return request\?\.body \?\? null;/);
});

test('changing body type updates the saved draft state', () => {
    const component = readFileSync(new URL('../app/app.ts', import.meta.url), 'utf8');
    assert.match(component, /this\.bodyMode !== \(api\.bodyMode \|\| 'raw'\)/);
    assert.match(
        component,
        /\(this\.currentFile\.extra\?\.bodyMode \|\| 'raw'\) !== this\.bodyMode/
    );
});
