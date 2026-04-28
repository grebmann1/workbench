import { test } from 'node:test';
import assert from 'node:assert/strict';

function stubWindow(language: string) {
    (globalThis as unknown as { window: { navigator: { language: string } } }).window = {
        navigator: { language },
    };
}

stubWindow('en-US');

const { I18nMixin } = await import('../i18n.ts');
const en = (await import('../messages/en.ts')).default;

class Base {}

function make(language: string) {
    stubWindow(language);
    const Mixed = I18nMixin(Base);
    return new Mixed() as Base & { i18n: Record<string, string> };
}

test('I18nMixin: returns English bundle for en-US', () => {
    const instance = make('en-US');
    for (const [key, value] of Object.entries(en)) {
        assert.equal(instance.i18n[key as keyof typeof en], value);
    }
});

test('I18nMixin: falls back to en bundle when language is unknown', () => {
    const instance = make('fr-FR');
    // No fr bundle; should still return every en key unchanged.
    assert.equal(Object.keys(instance.i18n).length, Object.keys(en).length);
    for (const key of Object.keys(en)) {
        assert.equal(instance.i18n[key], en[key as keyof typeof en]);
    }
});

test('I18nMixin: language with underscore separator gets its prefix normalized', () => {
    // The mixin strips _region to look up a prefix bundle.
    const instance = make('en_US');
    assert.ok(Object.keys(instance.i18n).length > 0);
});

test('I18nMixin: i18n is read-only per call (fresh object each access)', () => {
    const instance = make('en');
    const first = instance.i18n;
    const second = instance.i18n;
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
});

test('I18nMixin: preserves the base class constructor', () => {
    class Custom {
        marker = 42;
    }
    stubWindow('en-US');
    const Mixed = I18nMixin(Custom);
    const instance = new Mixed() as Custom & { i18n: Record<string, string> };
    assert.equal(instance.marker, 42);
    assert.ok(instance.i18n);
});
